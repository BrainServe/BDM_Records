package com.example.directory.catalog;
import com.example.directory.model.*;
import com.example.directory.repo.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.CacheControl;
import java.io.IOException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.util.*;
@RestController @RequestMapping("/api/sections")
public class CatalogController {
 private final PdfExporter pdfExporter;
 private final JdbcTemplate jdbc;
 private final NamedParameterJdbcTemplate named;
 private final CatalogRecordRepository records;
 private final CatalogItemRepository items;
 public CatalogController(JdbcTemplate jdbc,NamedParameterJdbcTemplate named,CatalogRecordRepository records,CatalogItemRepository items,PdfExporter pdfExporter) {
  this.pdfExporter=pdfExporter;
  this.jdbc=jdbc;this.named=named;this.records=records;this.items=items;
 }
 public record Section(UUID id,String name,String recordLabel,String itemLabel,String amountUnit,long recordCount,long itemCount){}
 public record SectionInput(@NotBlank @Size(max=100) String name,@NotBlank @Size(max=60) String recordLabel,
                             @NotBlank @Size(max=60) String itemLabel,@NotNull @Size(max=16) String amountUnit, @Size(max=100) String expectedName){}
 public record NameInput(@NotBlank @Size(max=180) String name, @Size(max=180) String expectedName){}
 public record ItemNameInput(@NotBlank @Size(max=120) String name, @Size(max=120) String expectedName){}
 public record Cell(UUID recordId,UUID itemId,@DecimalMin("0.00") @Digits(integer=14,fraction=2) BigDecimal amount,
                      @DecimalMin("0.00") @Digits(integer=14,fraction=2) BigDecimal expectedAmount){}
 public record BulkCells(@NotEmpty @Size(max=5000) List<@Valid Cell> updates){}
 public record Ids(@NotEmpty @Size(max=5000) List<@NotNull UUID> ids){}
 public record RecordWithValues(@NotBlank @Size(max=180) String name,@NotNull @Size(max=1000) List<@Valid ValueInput> values, @Size(max=180) String expectedName){}
 public record ValueInput(@NotNull UUID itemId,@DecimalMin("0.00") @Digits(integer=14,fraction=2) BigDecimal amount,
                            @DecimalMin("0.00") @Digits(integer=14,fraction=2) BigDecimal expectedAmount){}
 public record Row(UUID id,String name,Map<UUID,String> values){}
 public record Column(UUID id,String name){}
 public record Matrix(Section section,List<Row> rows,List<Column> columns){}
 @GetMapping public List<Section> sections() {
  return jdbc.query("""
   SELECT s.*, (SELECT COUNT(*) FROM catalog_records r WHERE r.section_id=s.id) AS record_count,
   (SELECT COUNT(*) FROM catalog_items i WHERE i.section_id=s.id) AS item_count
   FROM catalog_sections s ORDER BY s.created_at,s.name
   """,(rs,n)->mapSection(rs));
 }
 private Section mapSection(java.sql.ResultSet rs)throws java.sql.SQLException{
  return new Section((UUID)rs.getObject("id"),rs.getString("name"),rs.getString("record_label"),
    rs.getString("item_label"),rs.getString("amount_unit"),rs.getLong("record_count"),rs.getLong("item_count"));
 }
 private void exists(UUID id){Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM catalog_sections WHERE id=?",Integer.class,id);if(count==null||count==0)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Section not found");}
 private void recordInSection(UUID sec,UUID id) {
  Integer c=jdbc.queryForObject("SELECT COUNT(*) FROM catalog_records WHERE id=? AND section_id=?",Integer.class,id,sec);
  if(c==null||c==0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Record is not in selected section");
 }
 private void itemInSection(UUID sec,UUID id) {
  Integer c=jdbc.queryForObject("SELECT COUNT(*) FROM catalog_items WHERE id=? AND section_id=?",Integer.class,id,sec);
  if(c==null||c==0)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Column is not in selected section");
 }
 @PostMapping @ResponseStatus(HttpStatus.CREATED) @Transactional
 public Map<String,UUID> createSection(@Valid @RequestBody SectionInput input) {
  UUID id=UUID.randomUUID();jdbc.update("INSERT INTO catalog_sections(id,name,record_label,item_label,amount_unit) VALUES (?,?,?,?,?)",
     id,input.name().trim(),input.recordLabel().trim(),input.itemLabel().trim(),input.amountUnit().trim());
  return Map.of("id",id);
 }
 @PatchMapping("/{sectionId}") @Transactional public void editSection(@PathVariable UUID sectionId,@Valid @RequestBody SectionInput input){
  lockSection(sectionId);
  if(input.expectedName()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"An expected section name is required");
  int updated=jdbc.update("UPDATE catalog_sections SET name=?,record_label=?,item_label=?,amount_unit=? WHERE id=? AND name=?",
    input.name().trim(),input.recordLabel().trim(),input.itemLabel().trim(),input.amountUnit().trim(),sectionId,input.expectedName());
  if(updated==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Section was renamed elsewhere. Reload and retry.");
 }
 @DeleteMapping("/{sectionId}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
 public void deleteSection(@PathVariable UUID sectionId){lockSection(sectionId);jdbc.update("DELETE FROM catalog_sections WHERE id=?",sectionId);}
 @GetMapping("/{sectionId}/matrix") @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
 public Matrix matrix(@PathVariable UUID sectionId) {
  Section section=sections().stream().filter(s->s.id().equals(sectionId)).findFirst().orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Section not found"));
  List<Column> cols=jdbc.query("SELECT id,name FROM catalog_items WHERE section_id=? ORDER BY created_at,id",
     (rs,n)->new Column((UUID)rs.getObject("id"),rs.getString("name")),sectionId);
  List<Row> rows=jdbc.query("SELECT id,name FROM catalog_records WHERE section_id=? ORDER BY created_at,id",
     (rs,n)->new Row((UUID)rs.getObject("id"),rs.getString("name"),new LinkedHashMap<>()),sectionId);
  Map<UUID,Row> byId=new HashMap<>();rows.forEach(row->byId.put(row.id(),row));
  jdbc.query("""
   SELECT a.record_id,a.item_id,a.amount FROM catalog_amounts a
   JOIN catalog_records r ON a.record_id=r.id JOIN catalog_items i ON a.item_id=i.id
   WHERE r.section_id=? AND i.section_id=?
   """,rs->{Row row=byId.get((UUID)rs.getObject("record_id")); if(row!=null)row.values().put((UUID)rs.getObject("item_id"),rs.getBigDecimal("amount").toPlainString());},sectionId,sectionId);
  return new Matrix(section,rows,cols);
 }
 @GetMapping(value="/{sectionId}/export/pdf",produces="application/pdf") @Transactional(readOnly=true,isolation=Isolation.REPEATABLE_READ)
 public ResponseEntity<byte[]> exportPdf(@PathVariable UUID sectionId) throws IOException {
  // Bound CPU and heap use before loading the entire matrix into memory.
  exists(sectionId);
  Long total=jdbc.queryForObject("SELECT (SELECT COUNT(*) FROM catalog_records WHERE section_id=?) * (SELECT COUNT(*) FROM catalog_items WHERE section_id=?)",Long.class,sectionId,sectionId);
  if(total!=null&&total>12000L)throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE,"PDF has too many cells; export CSV instead");
  Matrix data=matrix(sectionId); // Shared section authorization and data source.
  String slug=data.section().name().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9-]+","-").replaceAll("^-|-$","");
  if(slug.isBlank())slug="directory";
  byte[] pdf=pdfExporter.render(data);
  return ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF)
     .header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\""+slug+"-directory.pdf\"")
     .cacheControl(CacheControl.noStore()).body(pdf);
 }
 @PostMapping("/{sectionId}/records") @ResponseStatus(HttpStatus.CREATED) @Transactional
 public Map<String,UUID> addRecord(@PathVariable UUID sectionId,@Valid @RequestBody NameInput input) {
  lockSection(sectionId);var record=records.saveAndFlush(new CatalogRecord(sectionId,input.name().trim()));return Map.of("id",record.id);
 }
 @PostMapping("/{sectionId}/records/with-values") @ResponseStatus(HttpStatus.CREATED) @Transactional
 public Map<String,UUID> addRecordWithValues(@PathVariable UUID sectionId,@Valid @RequestBody RecordWithValues input) {
  lockSection(sectionId);
  for(ValueInput v:input.values())itemInSection(sectionId,v.itemId());
  var r=records.saveAndFlush(new CatalogRecord(sectionId,input.name().trim()));
  for(ValueInput v:input.values())writeCell(new Cell(r.id,v.itemId(),v.amount(),null),false);
  return Map.of("id",r.id);
 }
 @PatchMapping("/{sectionId}/records/{recordId}/with-values") @Transactional
 public void editRecordWithValues(@PathVariable UUID sectionId,@PathVariable UUID recordId,@Valid @RequestBody RecordWithValues input) {
  lockSection(sectionId);
  recordInSection(sectionId,recordId);
  for(ValueInput v:input.values())itemInSection(sectionId,v.itemId());
  // Check all cells before any updates; a conflict aborts the full form transaction.
  for(ValueInput v:input.values())checkExpected(recordId,v.itemId(),v.expectedAmount());
  if(input.expectedName()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Expected record name is required");
  int renamed=jdbc.update("UPDATE catalog_records SET name=? WHERE id=? AND name=?",input.name().trim(),recordId,input.expectedName());
  if(renamed==0)throw new ResponseStatusException(HttpStatus.CONFLICT,"Record was renamed elsewhere. Reload and retry.");
  for(ValueInput v:input.values())writeCell(new Cell(recordId,v.itemId(),v.amount(),v.expectedAmount()),false);
 }
 @PatchMapping("/{sectionId}/records/{recordId}") @Transactional
 public void editRecord(@PathVariable UUID sectionId,@PathVariable UUID recordId,@Valid @RequestBody NameInput input) {
  lockSection(sectionId);recordInSection(sectionId,recordId);
  if(input.expectedName()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Expected record name is required");
  if(jdbc.update("UPDATE catalog_records SET name=? WHERE id=? AND name=?",input.name().trim(),recordId,input.expectedName())==0)
   throw new ResponseStatusException(HttpStatus.CONFLICT,"Record was renamed elsewhere. Reload and retry.");
 }
 @DeleteMapping("/{sectionId}/records/{recordId}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
 public void deleteRecord(@PathVariable UUID sectionId,@PathVariable UUID recordId){lockSection(sectionId);recordInSection(sectionId,recordId);jdbc.update("DELETE FROM catalog_records WHERE id=?",recordId);}
 @PostMapping("/{sectionId}/records/bulk-delete") @Transactional public Map<String,Integer> deleteRecords(@PathVariable UUID sectionId,@Valid @RequestBody Ids input){
  lockSection(sectionId);int n=named.update("DELETE FROM catalog_records WHERE section_id=:sec AND id IN (:ids)",Map.of("sec",sectionId,"ids",input.ids()));return Map.of("deleted",n);
 }
 @PostMapping("/{sectionId}/records/clear-values") @Transactional public Map<String,Integer> clearRecordValues(@PathVariable UUID sectionId,@Valid @RequestBody Ids input){
  lockSection(sectionId);
  int deleted=named.update("DELETE FROM catalog_amounts WHERE record_id IN (SELECT id FROM catalog_records WHERE section_id=:sec AND id IN (:ids))",
    Map.of("sec",sectionId,"ids",input.ids()));
  return Map.of("deleted",deleted);
 }
 @PostMapping("/{sectionId}/items") @ResponseStatus(HttpStatus.CREATED) @Transactional
 public Map<String,UUID> addItem(@PathVariable UUID sectionId,@Valid @RequestBody ItemNameInput input) {
  lockSection(sectionId);var item=items.saveAndFlush(new CatalogItem(sectionId,input.name().trim()));return Map.of("id",item.id);
 }
 @PatchMapping("/{sectionId}/items/{itemId}") @Transactional
 public void editItem(@PathVariable UUID sectionId,@PathVariable UUID itemId,@Valid @RequestBody ItemNameInput input){
  lockSection(sectionId);itemInSection(sectionId,itemId);
  if(input.expectedName()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Expected column name is required");
  if(jdbc.update("UPDATE catalog_items SET name=? WHERE id=? AND name=?",input.name().trim(),itemId,input.expectedName())==0)
   throw new ResponseStatusException(HttpStatus.CONFLICT,"Column was renamed elsewhere. Reload and retry.");
 }
 @DeleteMapping("/{sectionId}/items/{itemId}") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional
 public void deleteItem(@PathVariable UUID sectionId,@PathVariable UUID itemId){lockSection(sectionId);itemInSection(sectionId,itemId);jdbc.update("DELETE FROM catalog_items WHERE id=?",itemId);}
 @PostMapping("/{sectionId}/items/bulk-delete") @Transactional public Map<String,Integer> deleteItems(@PathVariable UUID sectionId,@Valid @RequestBody Ids input){
  lockSection(sectionId);int n=named.update("DELETE FROM catalog_items WHERE section_id=:sec AND id IN (:ids)",Map.of("sec",sectionId,"ids",input.ids()));return Map.of("deleted",n);
 }
 @PutMapping("/{sectionId}/cell") @Transactional public void updateCell(@PathVariable UUID sectionId,@Valid @RequestBody Cell input){
  lockSection(sectionId);validateCell(sectionId,input);checkExpected(input.recordId(),input.itemId(),input.expectedAmount());writeCell(input,false);
 }
 @PatchMapping("/{sectionId}/cells") @Transactional public Map<String,Integer> updateCells(@PathVariable UUID sectionId,@Valid @RequestBody BulkCells input){
  lockSection(sectionId);
  // Validate all submitted cells and expected values before changing anything.
  // The section row lock serializes edits across admins for transaction-level conflict detection.
  Set<String> addresses=new HashSet<>();
  for(Cell c:input.updates()){
   validateCell(sectionId,c);
   if(!addresses.add(c.recordId()+":"+c.itemId()))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Duplicate cell in batch");
   checkExpected(c.recordId(),c.itemId(),c.expectedAmount());
  }
  for(Cell c:input.updates())writeCell(c,false);
  return Map.of("updated",input.updates().size());
 }
 @DeleteMapping("/{sectionId}/values") @ResponseStatus(HttpStatus.NO_CONTENT) @Transactional public void clearValues(@PathVariable UUID sectionId){
  lockSection(sectionId);jdbc.update("DELETE FROM catalog_amounts WHERE record_id IN (SELECT id FROM catalog_records WHERE section_id=?)",sectionId);
 }
 private void validateCell(UUID sectionId,Cell cell){
  if(cell==null||cell.recordId()==null||cell.itemId()==null)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Record ID and column ID are required");
  recordInSection(sectionId,cell.recordId());itemInSection(sectionId,cell.itemId());
  if(cell.amount()!=null && (cell.amount().signum()<0||cell.amount().scale()>2||cell.amount().precision()-cell.amount().scale()>14))
    throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Amount must be nonnegative with up to 2 decimal places");
 }
 private void lockSection(UUID sectionId){
  exists(sectionId);
  jdbc.queryForObject("SELECT id FROM catalog_sections WHERE id=? FOR UPDATE",UUID.class,sectionId);
 }
 private void checkExpected(UUID recordId,UUID itemId,BigDecimal expected){
  List<BigDecimal> current=jdbc.query("SELECT amount FROM catalog_amounts WHERE record_id=? AND item_id=?",
   (rs,n)->rs.getBigDecimal("amount"),recordId,itemId);
  BigDecimal actual=current.isEmpty()?null:current.getFirst();
  if(actual==null ? expected!=null : expected==null||actual.compareTo(expected)!=0)
   throw new ResponseStatusException(HttpStatus.CONFLICT,"This amount was changed elsewhere. Reload before saving.");
 }
 private void writeCell(Cell c,boolean check){
  if(check)checkExpected(c.recordId(),c.itemId(),c.expectedAmount());
  if(c.amount()==null){jdbc.update("DELETE FROM catalog_amounts WHERE record_id=? AND item_id=?",c.recordId(),c.itemId());return;}
  jdbc.update("""
    INSERT INTO catalog_amounts (id,record_id,item_id,amount) VALUES(?,?,?,?)
    ON CONFLICT(record_id,item_id) DO UPDATE SET amount=EXCLUDED.amount
    """,UUID.randomUUID(),c.recordId(),c.itemId(),c.amount());
 }
}
