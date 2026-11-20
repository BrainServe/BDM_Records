package com.example.directory.model;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.UUID;
@Entity @Table(name="catalog_amounts")
public class CatalogAmount {
 @Id public UUID id;
 @Column(name="record_id",nullable=false) public UUID recordId;
 @Column(name="item_id",nullable=false) public UUID itemId;
 @Column(nullable=false, precision=16, scale=2) public BigDecimal amount;
 protected CatalogAmount() {}
 public CatalogAmount(UUID recordId,UUID itemId,BigDecimal amount) {this.id=UUID.randomUUID();this.recordId=recordId;this.itemId=itemId;this.amount=amount;}
}
