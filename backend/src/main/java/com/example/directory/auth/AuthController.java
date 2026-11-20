package com.example.directory.auth;
import com.example.directory.model.AppUser;
import com.example.directory.repo.AppUserRepository;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.*;
import java.util.HexFormat;
import java.util.concurrent.ConcurrentHashMap;
@RestController @RequestMapping("/api/auth")
public class AuthController {
 private final AppUserRepository users; private final PasswordEncoder encoder; private final JwtService jwt; private final JdbcTemplate jdbc;
 private final SecureRandom random=new SecureRandom();
 private final ConcurrentHashMap<String,Attempt> failures=new ConcurrentHashMap<>();
 private record Attempt(int count,long until){}
 @Value("${app.refresh.days}") private int refreshDays;
 @Value("${app.refresh.cookie-secure}") private boolean cookieSecure;
 @Value("${app.frontend-origin}") private String allowedOrigin;
 @Value("${app.setup.key:}") private String setupKey;
 public AuthController(AppUserRepository users,PasswordEncoder encoder,JwtService jwt,JdbcTemplate jdbc) {
  this.users=users;this.encoder=encoder;this.jwt=jwt;this.jdbc=jdbc;
 }
 public record Credentials(@NotBlank @Size(max=80) String username,@NotBlank @Size(max=128) String password){}
 public record Setup(@NotBlank @Size(min=3,max=80) String username,@NotBlank @Size(min=12,max=128) String password,@NotBlank @Size(max=256) String setupKey){}
 public record AuthResponse(String accessToken,int expiresIn,String username) {}
 @GetMapping("/status") public Map<String,Boolean> status(){return Map.of("setupRequired",users.count()==0);}
 @PostMapping("/setup") @Transactional
 public ResponseEntity<AuthResponse> setup(@Valid @RequestBody Setup input,HttpServletRequest request) {
  checkOrigin(request);
  String setupAttemptKey=request.getRemoteAddr()+":initial-admin";
  ensureNotBlocked(setupAttemptKey);
  if(setupKey==null||setupKey.length()<20)throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Administrator setup key is not configured");
  if(!MessageDigest.isEqual(setupKey.getBytes(StandardCharsets.UTF_8),input.setupKey().getBytes(StandardCharsets.UTF_8))) {
   recordFailure(setupAttemptKey);
   throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Invalid administrator setup key");
  }
  jdbc.execute("SELECT pg_advisory_xact_lock(963851423)");
  if(users.count()>0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Administrator already exists");
  String username=input.username().trim().toLowerCase(Locale.ROOT);
  if (!username.matches("[a-z0-9._-]{3,80}"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Username must use letters, numbers, dots, dashes or underscores");
  AppUser user=users.saveAndFlush(new AppUser(username,encoder.encode(input.password())));
  failures.remove(setupAttemptKey);
  return issue(user);
 }
 @PostMapping("/login") @Transactional
 public ResponseEntity<AuthResponse> login(@Valid @RequestBody Credentials input,HttpServletRequest request) {
  checkOrigin(request);
  String username=input.username().trim().toLowerCase(Locale.ROOT);
  String key=request.getRemoteAddr()+":"+username;
  ensureNotBlocked(key);
  AppUser user=users.findByUsername(username).orElse(null);
  // Use a valid dummy BCrypt hash to make unknown users comparably expensive to verify.
  String hash=user==null ? "$2y$12$s6W/qp7a9IXppiTIr9KuLO9Jl6gqaW9EZuIgrHu4wIVZLTMeozYwq" : user.passwordHash;
  boolean valid=encoder.matches(input.password(),hash);
  if(user==null || !valid){
   recordFailure(key);
   throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid username or password");
  }
  failures.remove(key);
  // Prevent stale sessions from accumulating indefinitely on a busy installation.
  jdbc.update("DELETE FROM refresh_sessions WHERE expires_at < NOW() - INTERVAL '1 day'");
  return issue(user);
 }
 @PostMapping("/refresh") @Transactional(noRollbackFor=ResponseStatusException.class)
 public ResponseEntity<AuthResponse> refresh(HttpServletRequest request) {
  checkOrigin(request);
  String raw=cookieValue(request);if(raw==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Session expired");
  List<Map<String,Object>> rows=jdbc.queryForList("SELECT id,user_id,family_id,revoked,rotated_at FROM refresh_sessions WHERE token_hash=? FOR UPDATE",sha(raw));
  if(rows.isEmpty())throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Invalid refresh session");
  Map<String,Object> row=rows.getFirst(); UUID userId=(UUID)row.get("user_id");
  if(Boolean.TRUE.equals(row.get("revoked"))) {
   // A second tab may arrive immediately after the original request rotated the cookie.
   // Give it a short retry window, but never return a new refresh token on replay.
   Object rotatedAt=row.get("rotated_at");
   Instant rotatedInstant=rotatedAt instanceof java.util.Date date ? date.toInstant() :
     rotatedAt instanceof java.time.OffsetDateTime offset ? offset.toInstant() : null;
   if(rotatedInstant!=null && rotatedInstant.isAfter(Instant.now().minusSeconds(8)))
    throw new ResponseStatusException(HttpStatus.CONFLICT,"Session rotated. Retry using the latest cookie.");
   UUID familyId=(UUID)row.get("family_id");
   jdbc.update("UPDATE refresh_sessions SET revoked=true WHERE family_id=?",familyId);
   // Access tokens minted for this family also become invalid after confirmed reuse.
   jdbc.update("UPDATE app_users SET access_version=access_version+1 WHERE id=?",userId);
   throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Session reuse detected. Sign in again.");
  }
  Integer valid=jdbc.queryForObject("SELECT COUNT(*) FROM refresh_sessions WHERE id=? AND expires_at>NOW()",Integer.class,row.get("id"));
  if(valid==null||valid==0)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Session expired");
  jdbc.update("UPDATE refresh_sessions SET revoked=true,rotated_at=NOW() WHERE id=?",row.get("id"));
  AppUser user=users.findById(userId).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  return issue(user,(UUID)row.get("family_id"));
 }
 @GetMapping("/me") public Map<String,Object> me(org.springframework.security.core.Authentication auth) {
  AppUser user=users.findById(UUID.fromString(auth.getName())).orElseThrow(()->new ResponseStatusException(HttpStatus.UNAUTHORIZED));
  return Map.of("username",user.username,"role",user.role);
 }
 @PostMapping("/logout") @Transactional
 public ResponseEntity<Void> logout(org.springframework.security.core.Authentication auth,HttpServletRequest request) {
  checkOrigin(request);
  // A refresh cookie remains valid after the short-lived access JWT expires.
  // Resolve the account using the cookie when bearer authentication is absent.
  UUID userId=auth instanceof UsernamePasswordAuthenticationToken && auth.isAuthenticated() && auth.getName()!=null
      ? UUID.fromString(auth.getName()) : null;
  String raw=cookieValue(request);
  if(userId==null && raw!=null) {
   List<UUID> found=jdbc.query("SELECT user_id FROM refresh_sessions WHERE token_hash=? AND revoked=false AND expires_at>NOW()",(rs,n)->(UUID)rs.getObject("user_id"),sha(raw));
   if(!found.isEmpty())userId=found.getFirst();
  }
  if(userId!=null) {
   jdbc.update("UPDATE app_users SET access_version=access_version+1 WHERE id=?",userId);
   jdbc.update("UPDATE refresh_sessions SET revoked=true WHERE user_id=?",userId);
  }
  ResponseCookie clear=ResponseCookie.from("directory_refresh","").path("/api/auth").httpOnly(true)
     .secure(cookieSecure).sameSite("Strict").maxAge(0).build();
  return ResponseEntity.noContent().header(HttpHeaders.SET_COOKIE,clear.toString())
     .header(HttpHeaders.CACHE_CONTROL,"no-store").build();
 }
 private ResponseEntity<AuthResponse> issue(AppUser user) { return issue(user,UUID.randomUUID()); }
 private ResponseEntity<AuthResponse> issue(AppUser user,UUID familyId) {
  byte[] secret=new byte[48]; random.nextBytes(secret);
  String raw=Base64.getUrlEncoder().withoutPadding().encodeToString(secret);
  jdbc.update("INSERT INTO refresh_sessions(id,user_id,family_id,token_hash,expires_at) VALUES(?,?,?,?,?)",
     UUID.randomUUID(),user.id,familyId,sha(raw),java.sql.Timestamp.from(Instant.now().plusSeconds(refreshDays*86400L)));
  ResponseCookie cookie=ResponseCookie.from("directory_refresh",raw).httpOnly(true).secure(cookieSecure)
      .sameSite("Strict").path("/api/auth").maxAge(refreshDays*86400L).build();
  return ResponseEntity.ok().header(HttpHeaders.SET_COOKIE,cookie.toString())
      .header(HttpHeaders.CACHE_CONTROL,"no-store").body(new AuthResponse(jwt.accessToken(user),jwt.expirySeconds(),user.username));
 }
 private void ensureNotBlocked(String key){
  long now=System.currentTimeMillis();
  // Remove expired counters periodically and fail closed at a bounded size;
  // large installations should additionally configure gateway-level throttling.
  if(failures.size()>5000)failures.entrySet().removeIf(e->e.getValue().until()<now);
  if(failures.size()>=10000&&!failures.containsKey(key))
   throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Too many authentication attempts. Try later.");
  Attempt a=failures.get(key);
  if(a!=null&&a.until()>now&&a.count()>=8)
   throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,"Too many attempts. Try again later.");
 }
 private void recordFailure(String key){
  long now=System.currentTimeMillis();
  failures.compute(key,(k,old)->old==null||old.until()<now?new Attempt(1,now+15*60_000L):new Attempt(old.count()+1,old.until()));
 }
 private String cookieValue(HttpServletRequest req) {
  if(req.getCookies()==null)return null;
  for(Cookie c:req.getCookies())if("directory_refresh".equals(c.getName()))return c.getValue();
  return null;
 }
 private String sha(String value) {
  try {return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));}
  catch(Exception e){throw new IllegalStateException(e);}
 }
 private void checkOrigin(HttpServletRequest req){
  String origin=req.getHeader("Origin");
  // Credential-carrying browser requests must have a trusted Origin; API clients
  // without an Origin are allowed only when no browser Fetch-Metadata is present.
  String fetchSite=req.getHeader("Sec-Fetch-Site");
  if(origin!=null&&!origin.equals(allowedOrigin))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Untrusted origin");
  if(fetchSite!=null&&!fetchSite.equals("same-origin")&&!fetchSite.equals("same-site")&&!fetchSite.equals("none"))
   throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Cross-site credential request blocked");
  if(fetchSite!=null&&origin==null)throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Origin header required");
 }
}
