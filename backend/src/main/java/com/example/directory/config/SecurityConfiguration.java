
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

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    // CORS configuration for the React frontend.
    @Bean
    public UrlBasedCorsConfigurationSource corsSource(
            @Value("${app.frontend-origin}") String origin) {

        CorsConfiguration config = new CorsConfiguration();

        config.setAllowedOrigins(List.of(origin));

        config.setAllowedMethods(List.of(
                "GET",
                "POST",
                "PATCH",
                "PUT",
                "DELETE",
                "OPTIONS"
        ));

        config.setAllowedHeaders(List.of(
                "Authorization",
                "Content-Type"
        ));

        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        UrlBasedCorsConfigurationSource source =
                new UrlBasedCorsConfigurationSource();

        source.registerCorsConfiguration("/api/**", config);

        return source;
    }

    @Bean
    public SecurityFilterChain filterChain(
            HttpSecurity http,
            JwtService jwt,
            AppUserRepository users,
            UrlBasedCorsConfigurationSource corsSource
    ) throws Exception {

        return http

            // API state changes use bearer JWT authentication.
            // Refresh cookies use SameSite=Strict and Origin checks.
            .csrf(csrf -> csrf.disable())

            // Enable configured CORS rules.
            .cors(cors ->
                cors.configurationSource(corsSource)
            )

            // JWT authentication is stateless.
            .sessionManagement(session ->
                session.sessionCreationPolicy(
                    SessionCreationPolicy.STATELESS
                )
            )

            // Browser security headers.
            .headers(headers -> headers

                .frameOptions(frame -> frame.deny())

                .contentTypeOptions(content -> {})

                .referrerPolicy(referrer ->
                    referrer.policy(
                        org.springframework.security.web.header.writers
                            .ReferrerPolicyHeaderWriter
                            .ReferrerPolicy.NO_REFERRER
                    )
                )

                // Allow the production React bundle to load.
                .contentSecurityPolicy(csp ->
                    csp.policyDirectives(
                        "default-src 'self'; " +
                        "script-src 'self'; " +
                        "style-src 'self' 'unsafe-inline'; " +
                        "img-src 'self' data:; " +
                        "font-src 'self' data:; " +
                        "connect-src 'self'; " +
                        "object-src 'none'; " +
                        "frame-ancestors 'none'; " +
                        "base-uri 'self'; " +
                        "form-action 'self'"
                    )
                )

                .addHeaderWriter((request, response) ->
                    response.setHeader(
                        "Permissions-Policy",
                        "camera=(), microphone=(), geolocation=()"
                    )
                )
            )

            .authorizeHttpRequests(auth -> auth

                // Allow CORS preflight requests.
                .requestMatchers(
                    HttpMethod.OPTIONS, "/**"
                ).permitAll()

                // Public React homepage and production assets.
                // Fixes HTTP 401 when opening the website.
                .requestMatchers(
                    HttpMethod.GET,
                    "/",
                    "/index.html",
                    "/assets/**",
                    "/favicon.ico",
                    "/favicon.png",
                    "/favicon-32.png",
                    "/favicon-48.png",
                    "/favicon-180.png",
                    "/favicon-192.png",
                    "/brainserve-mark.png",
                    "/brainserve-wordmark.png",
                    "/brainserve-auth-bg.webp"
                ).permitAll()

                // Allow Spring Boot error handling.
                .requestMatchers(
                    "/error"
                ).permitAll()

                // Public authentication endpoints.
                .requestMatchers(
                    "/api/auth/status",
                    "/api/auth/login",
                    "/api/auth/setup",
                    "/api/auth/refresh",
                    "/api/auth/logout"
                ).permitAll()

                // Admin-only institution management APIs.
                .requestMatchers(
                    "/api/sections",
                    "/api/sections/**"
                ).hasRole("ADMIN")

                // All remaining endpoints require authentication.
                .anyRequest().authenticated()
            )

            // Return 401 for unauthenticated protected requests.
            .exceptionHandling(exception ->
                exception.authenticationEntryPoint(
                    (request, response, authException) ->
                        response.sendError(
                            HttpStatus.UNAUTHORIZED.value(),
                            "Unauthorized"
                        )
                )
            )

            // Apply the existing custom JWT filter.
            .addFilterBefore(
                new JwtFilter(jwt, users),
                UsernamePasswordAuthenticationFilter.class
            )

            .build();
    }
}
