package com.example.directory;
import com.example.directory.auth.JwtService;
import com.example.directory.model.AppUser;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import java.security.SecureRandom;
import java.util.Base64;
import static org.junit.jupiter.api.Assertions.*;
class JwtServiceTest {
 private JwtService service(){
  var svc=new JwtService();byte[] secret=new byte[48];new SecureRandom().nextBytes(secret);
  ReflectionTestUtils.setField(svc,"secret",Base64.getEncoder().encodeToString(secret));
  ReflectionTestUtils.setField(svc,"issuer","institution-directory");
  ReflectionTestUtils.setField(svc,"accessSeconds",900);
  ReflectionTestUtils.invokeMethod(svc,"initialize");return svc;
 }
 @Test void signedAccessTokensValidateForMatchingSessionVersion(){
  JwtService jwt=service();AppUser user=new AppUser("admin", "hashed-password");
  String token=jwt.accessToken(user);
  assertEquals(user.id,jwt.verify(token,0));
  assertThrows(JwtException.class,()->jwt.verify(token,1));
 }
 @Test void tamperedTokenIsRejected(){
  JwtService jwt=service();String token=jwt.accessToken(new AppUser("admin","hash"));
  String[] parts=token.split("\\.");
  String broken=parts[0]+"."+parts[1]+"."+(parts[2].charAt(0)=='A'?'B':'A')+parts[2].substring(1);
  assertThrows(JwtException.class,()->jwt.verify(broken,0));
 }

 @Test void shortLivedAccessJwtExpires() throws Exception {
  JwtService jwt=service();
  ReflectionTestUtils.setField(jwt,"accessSeconds",1);
  String token=jwt.accessToken(new AppUser("admin","hash"));
  Thread.sleep(2100);
  assertThrows(JwtException.class,()->jwt.verify(token,0));
 }
}
