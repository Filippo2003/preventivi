import jsPDF from "jspdf";
import logoUrl from "./assets/logo.png";

// Convert an imported asset URL into a base64 data URL, since jsPDF wants
// either a data URL or an already-loaded image element.
async function toDataURL(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function euro(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
}

export async function generatePreventivoPDF({
  employee,
  cliente,
  clienteTipo,
  via,
  paese,
  cap,
  prov,
  numero,
  descrizione,
  voci,
  scontoPercent,
  ivaPercent,
  validitaGiorni,
  note,
  subtotale,
  scontoValore,
  imponibile,
  ivaValore,
  totale,
}) {
  const logoData = await toDataURL(logoUrl);

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = 210;
  const marginX = 20;
  const now = new Date();
  const dataStr = now.toLocaleDateString("it-IT");

  // ---- Header: logo + tagline, grassetto e centrata sotto il logo ----
  const logoW = 42;
  const logoH = logoW / (393 / 171);
  const logoX = marginX;
  doc.addImage(logoData, "PNG", logoX, 15, logoW, logoH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  const taglineLines = doc.splitTextToSize(
    "IMPIANTI ELETTRICI E TELEFONICI CIVILI E INDUSTRIALI, IMPIANTI DI SICUREZZA, CONDIZIONAMENTO, TVCC, DOMOTICA",
    logoW + 10
  );
  const logoCenterX = logoX + logoW / 2;
  doc.text(taglineLines, logoCenterX, 15 + logoH + 5, { align: "center" });

  // ---- Data (a destra), poi sotto: Spett / Sig(.ra) / indirizzo (blocco allineato a sinistra, letto da sx a dx) ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(`Gardigiano, ${dataStr}`, pageWidth - marginX, 30, { align: "right" });

  const clientBlockX = pageWidth - 85;
  let yRight = 40;
  doc.setFont("helvetica", "normal");
  if (clienteTipo === "azienda") {
    doc.setFont("helvetica", "bold");
    doc.text(`Spett.le ${cliente || "-"}`, clientBlockX, yRight);
    doc.setFont("helvetica", "normal");
  } else {
    doc.text("Spett.", clientBlockX, yRight);
    yRight += 6;
    doc.setFont("helvetica", "bold");
    const salutation = clienteTipo === "sigra" ? "Sig.ra" : "Sig.";
    doc.text(`${salutation} ${cliente || "-"}`, clientBlockX, yRight);
    doc.setFont("helvetica", "normal");
  }
  yRight += 6;
  const indirizzoCompleto = `${via || "-"}${paese ? `, ${paese}` : ""}${cap ? ` - ${cap}` : ""}${prov ? ` (${prov})` : ""}`;
  const indirizzoLines = doc.splitTextToSize(indirizzoCompleto, 65);
  doc.text(indirizzoLines, clientBlockX, yRight);
  yRight += indirizzoLines.length * 5.5;

  // ---- Corpo: parte sotto l'intestazione più bassa tra logo e blocco cliente ----
  let y = Math.max(15 + logoH + 14, yRight) + 12;

  // ---- Corpo ----
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.text(`Data: ${dataStr}`, marginX, y);

  y += 6;
  doc.text(`Validit\u00e0 offerta: ${validitaGiorni} giorni dalla data di emissione`, marginX, y);

  if (descrizione && descrizione.trim()) {
    y += 8;
    doc.setFont("helvetica", "bold");
    doc.text("Descrizione:", marginX, y);
    doc.setFont("helvetica", "normal");
    y += 5.5;
    const descrizioneLines = doc.splitTextToSize(descrizione, pageWidth - marginX * 2);
    doc.text(descrizioneLines, marginX, y);
    y += descrizioneLines.length * 4.8;
  }

  // ---- Tabella voci ----
  y += 10;
  const colDescX = marginX;
  const colQtyX = marginX + 82;
  const colUnitX = marginX + 100;
  const colPrezzoX = marginX + 118;
  const colScontoX = marginX + 145;
  const colTotX = pageWidth - marginX;

  function drawTableHeader() {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(29, 29, 27);
    doc.text("Descrizione", colDescX + 1, y);
    doc.text("Qt\u00e0", colQtyX, y);
    doc.text("Unit\u00e0", colUnitX, y);
    doc.text("Prezzo", colPrezzoX, y);
    doc.text("Sc.", colScontoX, y);
    doc.text("Totale", colTotX, y, { align: "right" });
    doc.setFont("helvetica", "normal");
    y += 2;
    doc.setDrawColor(29, 29, 27);
    doc.setLineWidth(0.4);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 5;
  }

  drawTableHeader();

  const vociCompilate = (voci || []).filter((r) => r.description || r.qty || r.price);
  if (vociCompilate.length === 0) {
    doc.setFontSize(9.5);
    doc.text("Nessuna voce inserita", colDescX, y);
    y += 6;
  } else {
    doc.setFontSize(9);
    vociCompilate.forEach((r) => {
      const qtyNum = parseFloat(String(r.qty).replace(",", ".")) || 0;
      const priceNum = parseFloat(String(r.price).replace(",", ".")) || 0;
      const discNum = parseFloat(String(r.discount).replace(",", ".")) || 0;
      const rowTotal = qtyNum * priceNum * (1 - discNum / 100);

      const descLines = doc.splitTextToSize(r.description || "-", 78);
      const rowHeight = Math.max(descLines.length * 4.6, 6);

      if (y + rowHeight > 265) {
        doc.addPage();
        y = 25;
        drawTableHeader();
        doc.setFontSize(9);
      }

      doc.text(descLines, colDescX, y);
      doc.text(r.qty ? String(r.qty) : "-", colQtyX, y);
      doc.text(r.unit || "-", colUnitX, y);
      doc.text(priceNum ? euro(priceNum) : "-", colPrezzoX, y);
      doc.text(discNum ? `${discNum}%` : "-", colScontoX, y);
      doc.text(rowTotal ? euro(rowTotal) : "-", colTotX, y, { align: "right" });

      y += rowHeight + 1.5;
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.15);
      doc.line(marginX, y - 3.2, pageWidth - marginX, y - 3.2);
    });
  }

  // ---- Totali ----
  if (y > 250) {
    doc.addPage();
    y = 25;
  }
  y += 6;
  const totalsLabelX = pageWidth - 75;

  doc.setFontSize(9.5);

  if (scontoValore > 0) {
    doc.text(`Sconto (${scontoPercent}%)`, totalsLabelX, y);
    doc.text(`- ${euro(scontoValore)}`, colTotX, y, { align: "right" });
    y += 6;
  }

  doc.text("Imponibile", totalsLabelX, y);
  doc.text(euro(imponibile), colTotX, y, { align: "right" });

  y += 6;
  const ivaLabel = `IVA (${ivaPercent}%)`;
  doc.text(ivaLabel, totalsLabelX, y);
  doc.text(euro(ivaValore), colTotX, y, { align: "right" });

  y += 3;
  doc.setDrawColor(29, 29, 27);
  doc.setLineWidth(0.3);
  doc.line(totalsLabelX, y, pageWidth - marginX, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Totale", totalsLabelX, y);
  doc.text(euro(totale), colTotX, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);

  // ---- Note ----
  if (note && note.trim()) {
    y += 12;
    if (y > 255) {
      doc.addPage();
      y = 25;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Note:", marginX, y);
    doc.setFont("helvetica", "normal");
    y += 5.5;
    y = doc.text(doc.splitTextToSize(note, pageWidth - marginX * 2), marginX, y);
  }

  // ---- Footer (su ogni pagina) ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    const footerY = 278;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(marginX, footerY - 8, pageWidth - marginX, footerY - 8);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("GATTO IMPIANTI SRL UNIPERSONALE", pageWidth / 2, footerY - 3, { align: "center" });

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.text(
      "Sede legale: Via Sbrojavacca 24, Gardigiano Scorz\u00e8 (VE) \u2014 P.IVA 03274680275 \u2014 info@gattoimpianti.it",
      pageWidth / 2,
      footerY + 2,
      { align: "center" }
    );
    doc.text(
      "Sede operativa e uffici: Via Pier Santi Mattarella 87, Gardigiano Scorz\u00e8 (VE) \u2014 tel. 041/449409",
      pageWidth / 2,
      footerY + 6,
      { align: "center" }
    );
  }

  return doc.output("blob");
}
