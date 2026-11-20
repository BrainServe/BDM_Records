package com.example.directory.model;
import jakarta.persistence.*;
import java.util.UUID;
@Entity @Table(name="catalog_items")
public class CatalogItem {
 @Id public UUID id;
 @Column(name="section_id",nullable=false) public UUID sectionId;
 @Column(nullable=false, length=120) public String name;
 protected CatalogItem() {}
 public CatalogItem(UUID sectionId,String name) {this.id=UUID.randomUUID();this.sectionId=sectionId;this.name=name;}
}
