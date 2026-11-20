package com.example.directory.auth;
import com.example.directory.model.AppUser;
import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import javax.crypto.SecretKey;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.UUID;
@Service
public class JwtService {
 @Value("${app.jwt.secret-base64}") private String secret;
 @Value("${app.jwt.issuer}") private String issuer;
 @Value("${app.jwt.access-seconds}") private int accessSeconds;
 private SecretKey key;
 @PostConstruct void initialize() {
  byte[] bytes;
  try { bytes=Base64.getDecoder().decode(secret); }
  catch (IllegalArgumentException e) { throw new IllegalStateException("JWT_SECRET_BASE64 must be valid Base64",e); }
  if (bytes.length<32) throw new IllegalStateException("JWT_SECRET_BASE64 must contain >=32 random bytes");
  key=Keys.hmacShaKeyFor(bytes);
 }
 public String accessToken(AppUser user) {
  Instant now=Instant.now();
  return Jwts.builder().subject(user.id.toString()).issuer(issuer).issuedAt(Date.from(now))
      .expiration(Date.from(now.plusSeconds(accessSeconds))).claim("type","access")
      .claim("v",user.accessVersion).signWith(key).compact();
 }
 public UUID verify(String token,int currentVersion) {
  Claims claims=Jwts.parser().verifyWith(key).requireIssuer(issuer).build().parseSignedClaims(token).getPayload();
  if (!"access".equals(claims.get("type",String.class))) throw new JwtException("Not an access token");
  if (((Number) claims.get("v")).intValue()!=currentVersion) throw new JwtException("Session revoked");
  return UUID.fromString(claims.getSubject());
 }
 public Claims parse(String token) {
  return Jwts.parser().verifyWith(key).requireIssuer(issuer).build().parseSignedClaims(token).getPayload();
 }
 public int expirySeconds() {return accessSeconds;}
}
