package com.example.directory.config;
import com.example.directory.auth.JwtFilter;
import com.example.directory.auth.JwtService;
import com.example.directory.repo.AppUserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import java.util.List;
@Configuration
public class SecurityConfiguration {
 @Bean PasswordEncoder passwordEncoder(){return new BCryptPasswordEncoder(12);}
 @Bean UrlBasedCorsConfigurationSource corsSource(@Value("${app.frontend-origin}") String origin) {
  CorsConfiguration c=new CorsConfiguration(); c.setAllowedOrigins(List.of(origin));
  c.setAllowedMethods(List.of("GET","POST","PATCH","PUT","DELETE","OPTIONS"));
  c.setAllowedHeaders(List.of("Authorization","Content-Type")); c.setAllowCredentials(true); c.setMaxAge(3600L);
  UrlBasedCorsConfigurationSource source=new UrlBasedCorsConfigurationSource();source.registerCorsConfiguration("/api/**",c); return source;
 }
 @Bean SecurityFilterChain filterChain(HttpSecurity http,JwtService jwt,AppUserRepository users,UrlBasedCorsConfigurationSource corsSource) throws Exception {
  return http.csrf(csrf->csrf.disable()) // State changes require bearer auth; refresh cookie is SameSite=Strict with Origin enforcement.
   .cors(cors->cors.configurationSource(corsSource))
   .sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
   .headers(h->h.frameOptions(f->f.deny())
      .contentTypeOptions(c->{})
      .referrerPolicy(r->r.policy(org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
      .contentSecurityPolicy(c->c.policyDirectives("default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"))
      .addHeaderWriter((request,response)->response.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()")))
   .authorizeHttpRequests(a->a.requestMatchers(HttpMethod.OPTIONS,"/**").permitAll()
      .requestMatchers("/api/auth/status","/api/auth/login","/api/auth/setup","/api/auth/refresh","/api/auth/logout").permitAll()
      .requestMatchers("/api/sections/**","/api/sections").hasRole("ADMIN")
      .anyRequest().authenticated())
   .exceptionHandling(e->e.authenticationEntryPoint((request,response,ex)->response.sendError(HttpStatus.UNAUTHORIZED.value(),"Unauthorized")))
   .addFilterBefore(new JwtFilter(jwt,users),UsernamePasswordAuthenticationFilter.class).build();
 }
}
