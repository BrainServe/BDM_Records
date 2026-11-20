package com.example.directory.model;
import jakarta.persistence.*;
import java.util.UUID;
@Entity @Table(name="app_users")
public class AppUser {
 @Id public UUID id;
 @Column(nullable=false, unique=true, length=80) public String username;
 @Column(name="password_hash", nullable=false) public String passwordHash;
 @Column(nullable=false) public String role="ADMIN";
 @Column(name="access_version",nullable=false) public int accessVersion=0;
 protected AppUser() {}
 public AppUser(String username,String passwordHash) { this.id=UUID.randomUUID(); this.username=username; this.passwordHash=passwordHash; }
}
