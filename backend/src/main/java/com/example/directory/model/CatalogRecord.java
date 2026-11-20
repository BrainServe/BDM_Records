package com.example.directory.model;
import jakarta.persistence.*;
import java.util.UUID;
@Entity @Table(name="catalog_records")
public class CatalogRecord {
 @Id public UUID id;
 @Column(name="section_id",nullable=false) public UUID sectionId;
 @Column(nullable=false, length=180) public String name;
 protected CatalogRecord() {}
 public CatalogRecord(UUID sectionId,String name) { this.id=UUID.randomUUID();this.sectionId=sectionId;this.name=name; }
}
