package com.example.directory;

import com.example.directory.catalog.CatalogController;
import com.example.directory.catalog.PdfExporter;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PdfExporterTest {
 @Test void exportsEmptyDirectoryAsReadablePdf() throws Exception {
  var matrix=new CatalogController.Matrix(
    new CatalogController.Section(UUID.randomUUID(),"IT","Institute","Course","INR",0,0),List.of(),List.of());
  var bytes=new PdfExporter("").render(matrix);
  assertTrue(bytes.length>200);
  try(var pdf=Loader.loadPDF(bytes)){
   assertEquals(1,pdf.getNumberOfPages());
   var text=new PDFTextStripper().getText(pdf);
   assertTrue(text.contains("IT"));
   assertTrue(text.contains("No records"));
  }
 }
 @Test void paginatesRowsAndDynamicColumnsWithoutDroppingValues() throws Exception {
  UUID one=UUID.randomUUID();
  var columns=new ArrayList<CatalogController.Column>();
  for(int i=0;i<7;i++)columns.add(new CatalogController.Column(UUID.randomUUID(),"Course "+i));
  var rows=new ArrayList<CatalogController.Row>();
  for(int i=0;i<48;i++){
   Map<UUID,String> values=new LinkedHashMap<>();values.put(columns.get(0).id(),"123.45");
   rows.add(new CatalogController.Row(UUID.randomUUID(),"Institute "+i,values));
  }
  var matrix=new CatalogController.Matrix(new CatalogController.Section(one,"Government","Institute","Course","INR",48,7),rows,columns);
  try(var pdf=Loader.loadPDF(new PdfExporter("").render(matrix))){
   assertEquals(6,pdf.getNumberOfPages()); // 2 column groups × 3 row groups
   var text=new PDFTextStripper().getText(pdf);
   assertTrue(text.contains("Institute 47"));
   assertTrue(text.contains("123.45"));
   assertTrue(text.contains("Course 6"));
  }
 }
}
