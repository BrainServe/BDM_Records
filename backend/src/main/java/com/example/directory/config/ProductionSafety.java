package com.example.directory.config;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import java.util.Arrays;
@Configuration
public class ProductionSafety {
 private final Environment environment;
 @Value("${app.refresh.cookie-secure}") private boolean secure;
 @Value("${app.frontend-origin}") private String origin;
 @Value("${app.setup.key:}") private String setupKey;
 public ProductionSafety(Environment environment) {this.environment=environment;}
 @PostConstruct void validate(){
  if(Arrays.asList(environment.getActiveProfiles()).contains("prod")){
   if(!secure) throw new IllegalStateException("prod requires secure refresh cookies (COOKIE_SECURE=true)");
   if(!origin.startsWith("https://"))throw new IllegalStateException("prod requires FRONTEND_ORIGIN=https://...");
   if(setupKey.length()<20)throw new IllegalStateException("prod requires a private ADMIN_SETUP_KEY of at least 20 characters");
  }
 }
}
