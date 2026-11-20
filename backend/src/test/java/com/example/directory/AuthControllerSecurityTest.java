package com.example.directory;

import com.example.directory.auth.AuthController;
import com.example.directory.auth.JwtService;
import com.example.directory.repo.AppUserRepository;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.Cookie;
import java.util.*;
import java.time.Instant;
import java.sql.Timestamp;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;
import static org.mockito.Mockito.*;
import static org.junit.jupiter.api.Assertions.*;

class AuthControllerSecurityTest {
 private AuthController controller(String key){
  var ctl=new AuthController(mock(AppUserRepository.class),mock(PasswordEncoder.class),mock(JwtService.class),mock(JdbcTemplate.class));
  ReflectionTestUtils.setField(ctl,"setupKey",key);
  ReflectionTestUtils.setField(ctl,"allowedOrigin","http://localhost:5173");
  return ctl;
 }
 private HttpServletRequest request(){var r=mock(HttpServletRequest.class);when(r.getRemoteAddr()).thenReturn("127.0.0.1");return r;}
 @Test void setupIsDisabledWithoutSecureSecret(){
  var exception=assertThrows(ResponseStatusException.class,()->controller("").setup(new AuthController.Setup("admin","GoodPassword1234","secret"),request()));
  assertEquals(HttpStatus.SERVICE_UNAVAILABLE,exception.getStatusCode());
 }
 @Test void setupRejectsWrongSecretBeforeAccessingDatabase(){
  var exception=assertThrows(ResponseStatusException.class,()->controller("sufficiently-long-private-key-value").setup(new AuthController.Setup("admin","GoodPassword1234","wrong"),request()));
  assertEquals(HttpStatus.FORBIDDEN,exception.getStatusCode());
 }
 @Test void rejectsUntrustedBrowserOrigin(){
  var request=request();when(request.getHeader("Origin")).thenReturn("https://evil.example");
  var exception=assertThrows(ResponseStatusException.class,()->controller("sufficiently-long-private-key-value").setup(new AuthController.Setup("admin","GoodPassword1234","sufficiently-long-private-key-value"),request));
  assertEquals(HttpStatus.FORBIDDEN,exception.getStatusCode());
 }
 @Test void recentlyRotatedCookieGetsConflictWithoutFamilyRevocation(){
  var jdbc=mock(JdbcTemplate.class);
  var ctl=new AuthController(mock(AppUserRepository.class),mock(PasswordEncoder.class),mock(JwtService.class),jdbc);
  ReflectionTestUtils.setField(ctl,"allowedOrigin","http://localhost:5173");
  var req=request();when(req.getCookies()).thenReturn(new Cookie[]{new Cookie("directory_refresh","rotated-cookie")});
  UUID session=UUID.randomUUID(),user=UUID.randomUUID(),family=UUID.randomUUID();
  Map<String,Object> row=new HashMap<>();row.put("id",session);row.put("user_id",user);row.put("family_id",family);
  row.put("revoked",true);row.put("rotated_at",Timestamp.from(Instant.now()));
  when(jdbc.queryForList(anyString(),anyString())).thenReturn(List.of(row));
  var exception=assertThrows(ResponseStatusException.class,()->ctl.refresh(req));
  assertEquals(HttpStatus.CONFLICT,exception.getStatusCode());
  verify(jdbc,never()).update(contains("family_id"),any(UUID.class));
 }
 @Test void oldRotatedCookieRevokesItsFamilyAndOutstandingAccessTokens(){
  var jdbc=mock(JdbcTemplate.class);
  var ctl=new AuthController(mock(AppUserRepository.class),mock(PasswordEncoder.class),mock(JwtService.class),jdbc);
  ReflectionTestUtils.setField(ctl,"allowedOrigin","http://localhost:5173");
  var req=request();when(req.getCookies()).thenReturn(new Cookie[]{new Cookie("directory_refresh","stale-cookie")});
  UUID session=UUID.randomUUID(),user=UUID.randomUUID(),family=UUID.randomUUID();
  Map<String,Object> row=new HashMap<>();row.put("id",session);row.put("user_id",user);row.put("family_id",family);
  row.put("revoked",true);row.put("rotated_at",Timestamp.from(Instant.now().minusSeconds(30)));
  when(jdbc.queryForList(anyString(),anyString())).thenReturn(List.of(row));
  var exception=assertThrows(ResponseStatusException.class,()->ctl.refresh(req));
  assertEquals(HttpStatus.UNAUTHORIZED,exception.getStatusCode());
  verify(jdbc).update(contains("family_id"),eq(family));
  verify(jdbc).update(contains("access_version"),eq(user));
 }
}
