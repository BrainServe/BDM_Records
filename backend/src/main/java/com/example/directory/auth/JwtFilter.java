package com.example.directory.auth;
import com.example.directory.repo.AppUserRepository;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;
import java.io.IOException;
import java.util.List;
import java.util.UUID;
public class JwtFilter extends OncePerRequestFilter {
 private final JwtService jwt;
 private final AppUserRepository users;
 public JwtFilter(JwtService jwt,AppUserRepository users){this.jwt=jwt;this.users=users;}
 @Override protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
  String header=request.getHeader("Authorization");
  if(header!=null && header.startsWith("Bearer ")) {
   try {
    var payload=jwt.parse(header.substring(7));
    UUID id=UUID.fromString(payload.getSubject());
    users.findById(id).ifPresent(user->{
     try {jwt.verify(header.substring(7),user.accessVersion);
      SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(user.id.toString(),null,List.of(new SimpleGrantedAuthority("ROLE_"+user.role))));}
     catch(RuntimeException ignored) {SecurityContextHolder.clearContext();}
    });
   } catch(JwtException | IllegalArgumentException ignored) {SecurityContextHolder.clearContext();}
  }
  chain.doFilter(request,response);
 }
}
