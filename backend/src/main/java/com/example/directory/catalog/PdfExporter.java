package com.example.directory.catalog;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

/** Authenticated, server-rendered, paginated PDF of the selected live database table. */
@Service
public class PdfExporter {
 private final String fontPath;
 private static final PDRectangle PAGE=PDRectangle.A4;
 private static final float W=PAGE.getHeight(), H=PAGE.getWidth(); // landscape
 private static final Color INK=new Color(31,41,55), MUTED=new Color(102,112,124);
 private static final Color RED=new Color(194,46,55), BORDER=new Color(220,225,230), SHADE=new Color(245,247,249);
 private static final int ROWS_PER_PAGE=22;
 private static final int COLS_PER_PAGE=5;

 public PdfExporter(@Value("${app.pdf.font-path:}") String fontPath){this.fontPath=fontPath;}

 public byte[] render(CatalogController.Matrix data) throws IOException {
  try(PDDocument doc=new PDDocument();ByteArrayOutputStream out=new ByteArrayOutputStream()){
   PDFont normal;
   PDFont bold;
   File installedFont=findFont();
   boolean unicode=installedFont!=null;
   if(unicode){
    File file=installedFont;
    if(!file.isFile())throw new IOException("Configured PDF_FONT_PATH is not a readable font file");
    normal=PDType0Font.load(doc,file);
    bold=normal;
   }else{
    normal=new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    bold=new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
   }
   int recordCount=data.rows().size();
   int groupCount=Math.max(1,(data.columns().size()+COLS_PER_PAGE-1)/COLS_PER_PAGE);
   int rowPages=Math.max(1,(recordCount+ROWS_PER_PAGE-1)/ROWS_PER_PAGE);
   int totalPages=groupCount*rowPages;
   int pageNo=0;
   for(int group=0;group<groupCount;group++){
    int fromCol=group*COLS_PER_PAGE;
    int toCol=Math.min(data.columns().size(),fromCol+COLS_PER_PAGE);
    List<CatalogController.Column> subset=data.columns().subList(fromCol,toCol);
    for(int rowPage=0;rowPage<rowPages;rowPage++){
     int fromRow=rowPage*ROWS_PER_PAGE;
     int toRow=Math.min(recordCount,fromRow+ROWS_PER_PAGE);
     PDPage page=new PDPage(new PDRectangle(W,H));doc.addPage(page);
     try(PDPageContentStream cs=new PDPageContentStream(doc,page)){
      pageNo++;
      rect(cs,0,H-7,W,7,RED);
      line(cs,normal,12,36,H-49,"BRAIN SERVE  /  DIRECTORY",INK,unicode);
      fit(cs,bold,20,36,H-82,W-72,data.section().name(),INK,unicode);
      String sub=plural(data.section().recordLabel())+" · "+recordCount+" records · "+data.columns().size()+" columns";
      line(cs,normal,10,36,H-103,sub,MUTED,unicode);
      line(cs,normal,9,W-155,H-49,LocalDate.now().format(DateTimeFormatter.ofPattern("dd MMM yyyy",Locale.ENGLISH)),MUTED,unicode);
      float tableTop=H-126, tableWidth=W-72, nameWidth=210;
      float itemWidth=subset.isEmpty()?0:(tableWidth-nameWidth)/subset.size();
      rect(cs,36,tableTop-27,tableWidth,27,INK);
      fit(cs,bold,10,46,tableTop-18,nameWidth-20,data.section().recordLabel(),Color.WHITE,unicode);
      for(int j=0;j<subset.size();j++){
       fit(cs,bold,9,36+nameWidth+j*itemWidth+9,tableTop-18,itemWidth-18,subset.get(j).name(),Color.WHITE,unicode);
      }
      if(recordCount==0){line(cs,normal,11,48,tableTop-65,"No records in this section.",MUTED,unicode);}
      for(int i=fromRow;i<toRow;i++){
       int n=i-fromRow;
       float y=tableTop-27-(n+1)*17;
       if(n%2==1)rect(cs,36,y,tableWidth,17,SHADE);
       CatalogController.Row r=data.rows().get(i);
       fit(cs,normal,9,46,y+5,nameWidth-20,r.name(),INK,unicode);
       for(int j=0;j<subset.size();j++){
        String amount=r.values().get(subset.get(j).id());
        String display=amount==null?"—":new BigDecimal(amount).stripTrailingZeros().toPlainString()+" "+data.section().amountUnit();
        fit(cs,normal,9,36+nameWidth+j*itemWidth+9,y+5,itemWidth-18,display,INK,unicode);
       }
       cs.setStrokingColor(BORDER);cs.setLineWidth(.3f);
       cs.moveTo(36,y);cs.lineTo(W-36,y);cs.stroke();
      }
      cs.setStrokingColor(BORDER);cs.setLineWidth(.6f);cs.moveTo(36,37);cs.lineTo(W-36,37);cs.stroke();
      line(cs,normal,8,36,24,"Generated from the live Brain Serve directory",MUTED,unicode);
      String footer="Page "+pageNo+" / "+totalPages+(groupCount>1?"  |  Column group "+(group+1)+" / "+groupCount:"");
      line(cs,normal,8,W-230,24,footer,MUTED,unicode);
     }
    }
   }
   doc.save(out);
   return out.toByteArray();
  }
 }
 private static String plural(String label){
  if(label.matches("(?i).*[^aeiou]y$"))return label.substring(0,label.length()-1)+"ies";
  if(label.matches("(?i).*(s|x|ch|sh)$"))return label+"es";
  return label+"s";
 }
 private File findFont() throws IOException {
  if(fontPath!=null&&!fontPath.isBlank()){
   File configured=new File(fontPath);
   if(!configured.isFile())throw new IOException("PDF_FONT_PATH must reference an installed font file");
   return configured;
  }
  // Use installed system fonts; the project archive never redistributes fonts.
  String[] candidates={
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    "C:/Windows/Fonts/Nirmala.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf"
  };
  for(String name:candidates){File f=new File(name);if(f.isFile())return f;}
  return null;
 }
 private static void rect(PDPageContentStream cs,float x,float y,float w,float h,Color fill)throws IOException{
  cs.setNonStrokingColor(fill);cs.addRect(x,y,w,h);cs.fill();
 }
 private static String safe(String s,PDFont font,boolean unicode)throws IOException{
  if(s==null)return "";
  String clean=s.replaceAll("[\\x00-\\x1F\\x7F]"," ");
  if(unicode){
   StringBuilder result=new StringBuilder();
   for(int offset=0;offset<clean.length();){
    int cp=clean.codePointAt(offset);offset+=Character.charCount(cp);
    String glyph=new String(Character.toChars(cp));
    try{font.getStringWidth(glyph);result.append(glyph);}
    catch(IllegalArgumentException|IOException unsupported){result.append(cp==0x20B9?"INR":"?");}
   }
   return result.toString();
  }
  clean=clean.replace("₹","INR").replace("€","EUR").replace("£","GBP").replace("—","-");
  StringBuilder result=new StringBuilder();
  for(int i=0;i<clean.length();i++){
   char c=clean.charAt(i);result.append(c>=32&&c<=126?c:'?');
  }
  return result.toString();
 }
 private static void line(PDPageContentStream cs,PDFont font,float size,float x,float y,String text,Color color,boolean unicode)throws IOException{
  cs.beginText();cs.setFont(font,size);cs.setNonStrokingColor(color);cs.newLineAtOffset(x,y);
  cs.showText(safe(text,font,unicode));cs.endText();
 }
 private static void fit(PDPageContentStream cs,PDFont font,float size,float x,float y,float maxWidth,String text,Color color,boolean unicode)throws IOException{
  String s=safe(text,font,unicode);
  while(!s.isEmpty()&&font.getStringWidth(s)/1000f*size>maxWidth)
   s=s.substring(0,s.offsetByCodePoints(s.length(),-1));
  if(!s.equals(safe(text,font,unicode))&&s.length()>3)s=s.substring(0,s.length()-3)+"...";
  line(cs,font,size,x,y,s,color,unicode);
 }
}
