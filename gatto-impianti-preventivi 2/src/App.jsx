import React, { useState, useRef, useEffect, useMemo } from "react";
import { Plus, ArrowLeft, Check, ChevronDown, User, AlertTriangle, Trash2 } from "lucide-react";
import logo from "./assets/logo.png";
import { generatePreventivoPDF } from "./pdf.js";

// ---- Official brand palette (sampled from the Gatto Impianti logo) ----
const GREEN = "#93C01F";
const GREEN_DARK = "#7CA419";
const GREEN_SOFT = "#EEF6DC";
const BLACK = "#1D1D1B";
const GRAY = "#8E8E93";
const BORDER = "#E5E5EA";
const SURFACE = "#F5F5F7";
const WHITE = "#FFFFFF";
const DANGER = "#D64545";
const DANGER_SOFT = "#FBEAEA";

// ---- Telegram configuration (set these in your .env file, see .env.example) ----
const TELEGRAM_BOT_TOKEN = import.meta.env.VITE_TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = import.meta.env.VITE_TELEGRAM_CHAT_ID;

const EMPLOYEES = ["Fabio", "Filippo", "Gastone"].sort((a, b) => a.localeCompare(b));

const UNIT_OPTIONS = ["Pz", "Mt", "Ore", "A corpo"];
const VALIDITA_OPTIONS = [15, 30, 45, 60, 90];

const emptyRow = (id) => ({ id, description: "", qty: "", unit: "Pz", price: "", discount: "" });

function euro(n) {
  const v = Number.isFinite(n) ? n : 0;
  return v.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " \u20ac";
}

function sanitizeDecimal(value) {
  let v = value.replace(/[^0-9.,]/g, "");
  const firstSepIndex = v.search(/[.,]/);
  if (firstSepIndex !== -1) {
    const head = v.slice(0, firstSepIndex + 1);
    const tail = v.slice(firstSepIndex + 1).replace(/[.,]/g, "");
    v = head + tail;
  }
  return v;
}

function sanitizeDigits(value) {
  return value.replace(/[^0-9]/g, "").slice(0, 5);
}

function makeNumero() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 900) + 100);
  return `${y}${m}${d}-${rand}`;
}

// ---- Codifica/decodifica dei dati del preventivo per il link "Modifica" ----
// (base64 URL-safe, con chiavi corte per restare compatti nel bottone Telegram)
function b64EncodeUnicode(str) {
  return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16))));
}

function b64DecodeUnicode(str) {
  return decodeURIComponent(
    atob(str)
      .split("")
      .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
      .join("")
  );
}

function buildEditPayload(state) {
  const compact = {
    e: state.employee,
    c: state.cliente,
    ct: state.clienteTipo,
    v: state.via,
    p: state.paese,
    cp: state.cap,
    pr: state.prov,
    sc: state.scontoPercent,
    iv: state.ivaPercentInput,
    vd: state.validitaGiorni,
    ds: state.descrizione,
    nt: state.note,
    // ogni voce come array compatto: [descrizione, qty, unit, price, discount]
    vc: state.voci
      .filter((r) => r.description || r.qty || r.price)
      .map((r) => [r.description, r.qty, r.unit, r.price, r.discount]),
  };
  const json = JSON.stringify(compact);
  return encodeURIComponent(b64EncodeUnicode(json));
}

function parseEditPayload(raw) {
  try {
    const json = b64DecodeUnicode(decodeURIComponent(raw));
    const compact = JSON.parse(json);
    return {
      employee: compact.e || null,
      cliente: compact.c || "",
      clienteTipo: compact.ct || "sig",
      via: compact.v || "",
      paese: compact.p || "",
      cap: compact.cp || "",
      prov: compact.pr || "",
      scontoPercent: compact.sc || "",
      ivaPercentInput: compact.iv || "22",
      validitaGiorni: compact.vd || 30,
      descrizione: compact.ds || "",
      note: compact.nt || "",
      voci: Array.isArray(compact.vc)
        ? compact.vc.map((r, i) => ({
            id: i + 1,
            description: r[0] || "",
            qty: r[1] || "",
            unit: r[2] || "Pz",
            price: r[3] || "",
            discount: r[4] || "",
          }))
        : [],
    };
  } catch (err) {
    console.error("Link di modifica non valido:", err);
    return null;
  }
}

function Wordmark({ height = "h-16" }) {
  return (
    <img
      src={logo}
      alt="Gatto Impianti"
      className={`${height} w-auto mx-auto select-none`}
      draggable="false"
    />
  );
}

function FieldSelect({ value, onChange, children, placeholder }) {
  const active = !!value;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="w-full appearance-none rounded-2xl py-3.5 pl-4 pr-10 text-base font-semibold focus:outline-none transition-colors"
        style={{
          backgroundColor: active ? GREEN_SOFT : SURFACE,
          color: BLACK,
          border: `1.5px solid ${active ? GREEN : "transparent"}`,
        }}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {children}
      </select>
      <ChevronDown
        size={18}
        className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2"
        style={{ color: active ? GREEN_DARK : GRAY }}
      />
    </div>
  );
}

function Label({ children }) {
  return (
    <div className="mb-2 text-[15px] font-semibold" style={{ color: BLACK }}>
      {children}
    </div>
  );
}

function UserDropdown({ options, onSelect }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, []);

  return (
    <div className="relative w-full" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl active:scale-[0.98] transition-transform"
        style={{
          backgroundColor: open ? GREEN_SOFT : SURFACE,
          border: `1.5px solid ${open ? GREEN : "transparent"}`,
        }}
      >
        <span
          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
          style={{ backgroundColor: WHITE, color: GREEN_DARK }}
        >
          <User size={18} />
        </span>
        <span className="text-[16px] font-semibold flex-1 text-left" style={{ color: BLACK }}>
          Seleziona utente
        </span>
        <ChevronDown
          size={20}
          style={{
            color: open ? GREEN_DARK : GRAY,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 right-0 mt-2 rounded-2xl overflow-hidden z-20"
          style={{
            backgroundColor: WHITE,
            border: `1px solid ${BORDER}`,
            boxShadow: "0 12px 28px rgba(29,29,27,0.14)",
          }}
        >
          {options.map((name, i) => (
            <button
              key={name}
              type="button"
              onClick={() => {
                setOpen(false);
                onSelect(name);
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70"
              style={{
                borderTop: i === 0 ? "none" : `1px solid ${BORDER}`,
                backgroundColor: WHITE,
              }}
            >
              <span
                className="text-xs font-bold shrink-0 w-7 h-7 flex items-center justify-center rounded-full"
                style={{ backgroundColor: SURFACE, color: GREEN_DARK }}
              >
                {name.charAt(0)}
              </span>
              <span className="text-[15px] font-semibold" style={{ color: BLACK }}>
                {name}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("home"); // home | form | success
  const [employee, setEmployee] = useState(null);
  const [cliente, setCliente] = useState("");
  const [clienteTipo, setClienteTipo] = useState("sig");

  const [via, setVia] = useState("");
  const [paese, setPaese] = useState("");
  const [cap, setCap] = useState("");
  const [prov, setProv] = useState("");

  const [scontoPercent, setScontoPercent] = useState("");
  const [ivaPercentInput, setIvaPercentInput] = useState("22");
  const [validitaGiorni, setValiditaGiorni] = useState(30);
  const [descrizione, setDescrizione] = useState("");
  const [note, setNote] = useState("");

  const rowId = useRef(6);
  const [voci, setVoci] = useState(Array.from({ length: 6 }, (_, i) => emptyRow(i + 1)));

  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");

  // Se l'app viene aperta da un link "Modifica Preventivo" (?edit=...),
  // precompila tutti i campi con i dati del preventivo originale.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("edit");
    if (!raw) return;

    const data = parseEditPayload(raw);
    if (!data) return;

    setEmployee(data.employee);
    setCliente(data.cliente);
    setClienteTipo(data.clienteTipo);
    setVia(data.via);
    setPaese(data.paese);
    setCap(data.cap);
    setProv(data.prov);
    setScontoPercent(data.scontoPercent);
    setIvaPercentInput(data.ivaPercentInput);
    setValiditaGiorni(data.validitaGiorni);
    setDescrizione(data.descrizione);
    setNote(data.note);

    if (data.voci.length > 0) {
      rowId.current = data.voci.length;
      setVoci(data.voci);
    }

    setScreen("form");

    // Ripulisce l'URL (toglie ?edit=...) per evitare ricariche accidentali dei dati.
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const totals = useMemo(() => {
    const subtotale = voci.reduce((sum, r) => {
      const q = parseFloat(String(r.qty).replace(",", ".")) || 0;
      const p = parseFloat(String(r.price).replace(",", ".")) || 0;
      const rd = parseFloat(String(r.discount).replace(",", ".")) || 0;
      const rowGross = q * p;
      const rowNet = rowGross * (1 - rd / 100);
      return sum + rowNet;
    }, 0);
    const scontoNum = parseFloat(String(scontoPercent).replace(",", ".")) || 0;
    const scontoValore = subtotale * (scontoNum / 100);
    const imponibile = subtotale - scontoValore;
    const ivaNum = parseFloat(String(ivaPercentInput).replace(",", "."));
    const ivaPercent = Number.isFinite(ivaNum) ? ivaNum : 0;
    const ivaValore = imponibile * (ivaPercent / 100);
    const totale = imponibile + ivaValore;
    return { subtotale, scontoValore, imponibile, ivaPercent, ivaValore, totale };
  }, [voci, scontoPercent, ivaPercentInput]);

  function selectEmployee(name) {
    setEmployee(name);
    setScreen("form");
  }

  function resetAll() {
    setEmployee(null);
    setCliente("");
    setClienteTipo("sig");
    setVia("");
    setPaese("");
    setCap("");
    setProv("");
    setScontoPercent("");
    setIvaPercentInput("22");
    setValiditaGiorni(30);
    setDescrizione("");
    setNote("");
    setSendError("");
    rowId.current = 6;
    setVoci(Array.from({ length: 6 }, (_, i) => emptyRow(i + 1)));
  }

  function addRow() {
    rowId.current += 1;
    setVoci((rows) => [...rows, emptyRow(rowId.current)]);
  }

  function removeRow(id) {
    setVoci((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  }

  function updateRow(id, field, value) {
    setVoci((rows) =>
      rows.map((r) => {
        if (r.id !== id) return r;
        if (field === "qty" || field === "price" || field === "discount") {
          return { ...r, [field]: sanitizeDecimal(value) };
        }
        return { ...r, [field]: value };
      })
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSendError("");

    const numero = makeNumero();

    const vociCompilate = voci.filter((r) => r.description || r.qty || r.price);
    const vociTesto =
      vociCompilate.length > 0
        ? vociCompilate
            .map((r) => {
              const q = parseFloat(String(r.qty).replace(",", ".")) || 0;
              const p = parseFloat(String(r.price).replace(",", ".")) || 0;
              const rd = parseFloat(String(r.discount).replace(",", ".")) || 0;
              const rowTotal = q * p * (1 - rd / 100);
              const scontoTxt = rd > 0 ? ` (sc. ${rd}%)` : "";
              return `- ${r.description || "(senza descrizione)"} \u2014 ${r.qty || "?"} ${r.unit} x ${euro(p)}${scontoTxt} = ${euro(rowTotal)}`;
            })
            .join("\n")
        : "Nessuna voce inserita";

    const messaggio = [
      `\uD83D\uDCC4 Nuovo preventivo N. ${numero} — ${employee}`,
      `\uD83D\uDCC5 ${new Date().toLocaleString("it-IT")}`,
      "",
      `\uD83D\uDC64 Cliente: ${clienteTipo === "azienda" ? "Azienda" : clienteTipo === "sigra" ? "Sig.ra" : "Sig."} ${cliente || "-"}`,
      `\uD83D\uDCCD Via: ${via || "-"}`,
      `Paese: ${paese || "-"}`,
      `CAP: ${cap || "-"} — Provincia: ${prov || "-"}`,
      "",
      "\uD83E\uDDFE Voci:",
      vociTesto,
      "",
      `Subtotale: ${euro(totals.subtotale)}`,
      totals.scontoValore > 0 ? `Sconto (${scontoPercent}%): -${euro(totals.scontoValore)}` : null,
      `Imponibile: ${euro(totals.imponibile)}`,
      `IVA (${totals.ivaPercent}%): ${euro(totals.ivaValore)}`,
      `\uD83D\uDCB0 Totale: ${euro(totals.totale)}`,
      "",
      `Validit\u00e0 offerta: ${validitaGiorni} giorni`,
      descrizione ? `Descrizione: ${descrizione}` : null,
      note ? `Note: ${note}` : null,
    ]
      .filter((line) => line !== null)
      .join("\n");

    // Link "Modifica Preventivo": riapre il sito con tutti i dati precompilati.
    const editPayload = buildEditPayload({
      employee,
      cliente,
      clienteTipo,
      via,
      paese,
      cap,
      prov,
      scontoPercent,
      ivaPercentInput,
      validitaGiorni,
      descrizione,
      note,
      voci,
    });
    const editUrl = `${window.location.origin}${window.location.pathname}?edit=${editPayload}`;

    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      // Le chiavi Telegram non sono configurate: modalità demo, nessun messaggio reale viene inviato.
      console.warn(
        "Telegram non configurato. Aggiungi le variabili VITE_TELEGRAM_* nel file .env per inviare messaggi reali."
      );
      setScreen("success");
      setTimeout(() => {
        resetAll();
        setScreen("home");
      }, 1600);
      return;
    }

    setSending(true);
    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: messaggio,
          reply_markup: {
            inline_keyboard: [[{ text: "\u270F\uFE0F Modifica Preventivo", url: editUrl }]],
          },
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.description || "Errore sconosciuto da Telegram");
      }

      // Genera il PDF con l'intestazione aziendale e lo invia come documento.
      const pdfBlob = await generatePreventivoPDF({
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
        scontoPercent: parseFloat(String(scontoPercent).replace(",", ".")) || 0,
        ivaPercent: totals.ivaPercent,
        validitaGiorni,
        note,
        subtotale: totals.subtotale,
        scontoValore: totals.scontoValore,
        imponibile: totals.imponibile,
        ivaValore: totals.ivaValore,
        totale: totals.totale,
      });
      const fileSafeName = (cliente || "preventivo").replace(/\s+/g, "_");
      const formData = new FormData();
      formData.append("chat_id", TELEGRAM_CHAT_ID);
      formData.append("document", pdfBlob, `preventivo_${numero}_${fileSafeName}.pdf`);
      const docUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendDocument`;
      const docRes = await fetch(docUrl, { method: "POST", body: formData });
      const docData = await docRes.json();
      if (!docData.ok) {
        throw new Error(docData.description || "Errore invio PDF a Telegram");
      }

      setSending(false);
      setScreen("success");
      setTimeout(() => {
        resetAll();
        setScreen("home");
      }, 1600);
    } catch (err) {
      console.error("Errore invio Telegram:", err);
      setSending(false);
      setSendError("Invio non riuscito: " + err.message);
    }
  }

  return (
    <div
      className="min-h-screen w-full flex justify-center"
      style={{ backgroundColor: WHITE, fontFamily: "-apple-system, system-ui, sans-serif" }}
    >
      <div className="w-full max-w-md min-h-screen relative" style={{ backgroundColor: WHITE }}>
        {screen === "home" && <HomeScreen onSelect={selectEmployee} />}
        {screen === "form" && (
          <FormScreen
            employee={employee}
            cliente={cliente}
            setCliente={setCliente}
            clienteTipo={clienteTipo}
            setClienteTipo={setClienteTipo}
            onBack={() => {
              resetAll();
              setScreen("home");
            }}
            via={via}
            setVia={setVia}
            paese={paese}
            setPaese={setPaese}
            cap={cap}
            setCap={setCap}
            prov={prov}
            setProv={setProv}
            voci={voci}
            updateRow={updateRow}
            addRow={addRow}
            removeRow={removeRow}
            scontoPercent={scontoPercent}
            setScontoPercent={setScontoPercent}
            ivaPercentInput={ivaPercentInput}
            setIvaPercentInput={setIvaPercentInput}
            validitaGiorni={validitaGiorni}
            setValiditaGiorni={setValiditaGiorni}
            descrizione={descrizione}
            setDescrizione={setDescrizione}
            note={note}
            setNote={setNote}
            totals={totals}
            onSubmit={handleSubmit}
            sending={sending}
            sendError={sendError}
          />
        )}
        {screen === "success" && <SuccessScreen />}
      </div>
    </div>
  );
}

function HomeScreen({ onSelect }) {
  return (
    <div className="flex flex-col min-h-screen">
      <header className="px-6 pt-12 pb-8 flex flex-col items-center text-center">
        <Wordmark height="h-20" />
        <p className="mt-5 text-[15px] font-medium" style={{ color: GRAY }}>
          Seleziona il tuo nome per creare un nuovo preventivo.
        </p>
      </header>

      <div className="flex-1 px-5 pb-8">
        <UserDropdown options={EMPLOYEES} onSelect={onSelect} />
      </div>

      <div className="px-6 pb-8 text-center">
        <span className="text-xs font-medium" style={{ color: GRAY }}>
          Squadra registrata &middot; {EMPLOYEES.length} operatori
        </span>
      </div>
    </div>
  );
}

function FormScreen({
  employee,
  cliente,
  setCliente,
  clienteTipo,
  setClienteTipo,
  onBack,
  via,
  setVia,
  paese,
  setPaese,
  cap,
  setCap,
  prov,
  setProv,
  voci,
  updateRow,
  addRow,
  removeRow,
  scontoPercent,
  setScontoPercent,
  ivaPercentInput,
  setIvaPercentInput,
  validitaGiorni,
  setValiditaGiorni,
  descrizione,
  setDescrizione,
  note,
  setNote,
  totals,
  onSubmit,
  sending,
  sendError,
}) {
  return (
    <div className="flex flex-col min-h-screen pb-10">
      <header className="px-5 pt-8 pb-4 sticky top-0 z-10 flex items-start justify-between gap-3" style={{ backgroundColor: WHITE }}>
        <div>
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 text-[15px] font-semibold mb-4 active:opacity-60"
            style={{ color: GREEN_DARK }}
          >
            <ArrowLeft size={18} /> Operatori
          </button>
          <h1 className="text-2xl font-extrabold" style={{ color: BLACK }}>
            {employee}
          </h1>
        </div>
        <img src={logo} alt="Gatto Impianti" className="h-9 w-auto shrink-0 mt-0.5" draggable="false" />
      </header>

      <form onSubmit={onSubmit} className="px-5 pt-2 flex flex-col gap-7">
        {/* TIPO CLIENTE */}
        <section>
          <Label>Il cliente è</Label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: "sig", label: "Signor" },
              { value: "sigra", label: "Signora" },
              { value: "azienda", label: "Azienda" },
            ].map((opt) => {
              const active = clienteTipo === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setClienteTipo(opt.value)}
                  className="rounded-2xl py-3 text-sm font-bold active:scale-[0.98] transition-transform"
                  style={{
                    backgroundColor: active ? GREEN : SURFACE,
                    color: active ? WHITE : BLACK,
                    border: `1.5px solid ${active ? GREEN : "transparent"}`,
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </section>

        {/* CLIENTE */}
        <section>
          <Label>{clienteTipo === "azienda" ? "Ragione sociale" : "Cliente"}</Label>
          <input
            type="text"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            placeholder={clienteTipo === "azienda" ? "Nome dell'azienda" : "Nome e cognome del cliente"}
            className="w-full rounded-2xl py-3.5 px-4 text-base font-medium focus:outline-none"
            style={{
              backgroundColor: SURFACE,
              color: BLACK,
              border: `1.5px solid ${cliente ? GREEN : "transparent"}`,
            }}
          />
        </section>

        {/* LUOGO INTERVENTO */}
        <section>
          <Label>Presso che Via verrà eseguito il lavoro</Label>
          <input
            type="text"
            value={via}
            onChange={(e) => setVia(e.target.value)}
            placeholder="Es. Via Roma 12"
            className="w-full rounded-2xl py-3.5 px-4 text-base font-medium focus:outline-none"
            style={{
              backgroundColor: SURFACE,
              color: BLACK,
              border: `1.5px solid ${via ? GREEN : "transparent"}`,
            }}
          />
        </section>

        <section>
          <Label>Presso che paese verrà eseguito il lavoro</Label>
          <input
            type="text"
            value={paese}
            onChange={(e) => setPaese(e.target.value)}
            placeholder="Es. Scorzè"
            className="w-full rounded-2xl py-3.5 px-4 text-base font-medium focus:outline-none"
            style={{
              backgroundColor: SURFACE,
              color: BLACK,
              border: `1.5px solid ${paese ? GREEN : "transparent"}`,
            }}
          />
          <div className="mt-2.5 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs font-semibold mb-1.5" style={{ color: GRAY }}>
                CAP
              </div>
              <input
                type="text"
                inputMode="numeric"
                value={cap}
                onChange={(e) => setCap(sanitizeDigits(e.target.value))}
                placeholder="30035"
                className="w-full rounded-2xl py-3 px-4 text-sm font-mono font-bold focus:outline-none"
                style={{
                  backgroundColor: cap ? GREEN_SOFT : SURFACE,
                  border: `1.5px solid ${cap ? GREEN : "transparent"}`,
                  color: BLACK,
                }}
              />
            </div>
            <div>
              <div className="text-xs font-semibold mb-1.5" style={{ color: GRAY }}>
                Provincia
              </div>
              <input
                type="text"
                value={prov}
                onChange={(e) => setProv(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="VE"
                className="w-full rounded-2xl py-3 px-4 text-sm font-mono font-bold focus:outline-none"
                style={{
                  backgroundColor: prov ? GREEN_SOFT : SURFACE,
                  border: `1.5px solid ${prov ? GREEN : "transparent"}`,
                  color: BLACK,
                }}
              />
            </div>
          </div>
        </section>

        {/* DESCRIZIONE PREVENTIVO */}
        <section>
          <Label>Descrizione del preventivo</Label>
          <textarea
            value={descrizione}
            onChange={(e) => setDescrizione(e.target.value)}
            placeholder="Descrivi brevemente l'intervento o il lavoro oggetto del preventivo..."
            rows={3}
            className="w-full rounded-2xl py-3.5 px-4 text-base leading-relaxed focus:outline-none resize-none"
            style={{
              backgroundColor: SURFACE,
              color: BLACK,
              border: `1.5px solid ${descrizione ? GREEN : "transparent"}`,
            }}
          />
        </section>

        {/* VOCI DI PREVENTIVO */}
        <section>
          <Label>Voci di preventivo</Label>
          <div className="flex flex-col gap-2.5">
            {voci.map((row) => {
              const q = parseFloat(String(row.qty).replace(",", ".")) || 0;
              const p = parseFloat(String(row.price).replace(",", ".")) || 0;
              const rd = parseFloat(String(row.discount).replace(",", ".")) || 0;
              const rowGross = q * p;
              const rowTotal = rowGross * (1 - rd / 100);
              return (
                <div
                  key={row.id}
                  className="rounded-2xl p-3"
                  style={{ backgroundColor: SURFACE, border: `1px solid ${BORDER}` }}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => updateRow(row.id, "description", e.target.value)}
                      placeholder="Descrizione voce (es. Fornitura e posa quadro elettrico)"
                      className="flex-1 rounded-xl text-sm font-semibold py-2.5 px-3 focus:outline-none"
                      style={{ border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: BLACK }}
                    />
                    {voci.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center active:opacity-70"
                        style={{ backgroundColor: DANGER_SOFT, color: DANGER }}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: "60px 68px 1fr 64px" }}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={row.qty}
                      onChange={(e) => updateRow(row.id, "qty", e.target.value)}
                      placeholder="Qtà"
                      className="rounded-xl text-xs font-bold py-2 px-2 text-center focus:outline-none"
                      style={{ border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: BLACK }}
                    />
                    <select
                      value={row.unit}
                      onChange={(e) => updateRow(row.id, "unit", e.target.value)}
                      className="rounded-xl text-xs font-bold py-2 px-1.5 focus:outline-none"
                      style={{ border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: BLACK }}
                    >
                      {UNIT_OPTIONS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.price}
                        onChange={(e) => updateRow(row.id, "price", e.target.value)}
                        placeholder="Prezzo unitario"
                        className="w-full rounded-xl text-xs font-bold py-2 pl-2 pr-7 focus:outline-none"
                        style={{ border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: BLACK }}
                      />
                      <span
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold"
                        style={{ color: GRAY }}
                      >
                        €
                      </span>
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.discount}
                        onChange={(e) => updateRow(row.id, "discount", e.target.value)}
                        placeholder="Sc."
                        className="w-full rounded-xl text-xs font-bold py-2 pl-2 pr-5 text-center focus:outline-none"
                        style={{ border: `1px solid ${BORDER}`, backgroundColor: WHITE, color: BLACK }}
                      />
                      <span
                        className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] font-bold"
                        style={{ color: GRAY }}
                      >
                        %
                      </span>
                    </div>
                  </div>
                  {rowGross > 0 && (
                    <div className="mt-2 text-right text-xs font-bold" style={{ color: GREEN_DARK }}>
                      {rd > 0 && (
                        <span className="mr-2 font-medium line-through" style={{ color: GRAY }}>
                          {euro(rowGross)}
                        </span>
                      )}
                      Totale riga: {euro(rowTotal)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button
            type="button"
            onClick={addRow}
            className="mt-3 w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-bold active:scale-[0.98] transition-transform"
            style={{ backgroundColor: GREEN_SOFT, color: GREEN_DARK }}
          >
            <Plus size={16} /> Aggiungi voce
          </button>
        </section>

        {/* SCONTO / IVA / VALIDITA */}
        <section className="grid grid-cols-2 gap-4">
          <div>
            <Label>Sconto %</Label>
            <input
              type="text"
              inputMode="decimal"
              value={scontoPercent}
              onChange={(e) => setScontoPercent(sanitizeDecimal(e.target.value))}
              placeholder="0"
              className="w-full rounded-2xl py-3.5 px-4 text-base font-semibold focus:outline-none"
              style={{
                backgroundColor: SURFACE,
                color: BLACK,
                border: `1.5px solid ${scontoPercent ? GREEN : "transparent"}`,
              }}
            />
          </div>
          <div>
            <Label>IVA %</Label>
            <div className="relative">
              <input
                type="text"
                inputMode="decimal"
                value={ivaPercentInput}
                onChange={(e) => setIvaPercentInput(sanitizeDecimal(e.target.value))}
                placeholder="22"
                className="w-full rounded-2xl py-3.5 pl-4 pr-9 text-base font-semibold focus:outline-none"
                style={{
                  backgroundColor: SURFACE,
                  color: BLACK,
                  border: `1.5px solid ${ivaPercentInput ? GREEN : "transparent"}`,
                }}
              />
              <span
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold"
                style={{ color: GRAY }}
              >
                %
              </span>
            </div>
          </div>
        </section>

        <section>
          <Label>Validità offerta</Label>
          <FieldSelect value={String(validitaGiorni)} onChange={(e) => setValiditaGiorni(Number(e.target.value))}>
            {VALIDITA_OPTIONS.map((v) => (
              <option key={v} value={v}>
                {v} giorni
              </option>
            ))}
          </FieldSelect>
        </section>

        {/* NOTE */}
        <section>
          <Label>Note (facoltative)</Label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Condizioni di pagamento, esclusioni, tempistiche..."
            rows={4}
            className="w-full rounded-2xl py-3.5 px-4 text-base leading-relaxed focus:outline-none resize-none"
            style={{
              backgroundColor: SURFACE,
              color: BLACK,
              border: `1.5px solid ${note ? GREEN : "transparent"}`,
            }}
          />
        </section>

        {/* RIEPILOGO TOTALI */}
        <section
          className="rounded-2xl p-4 flex flex-col gap-1.5"
          style={{ backgroundColor: GREEN_SOFT, border: `1px solid ${GREEN}` }}
        >
          <div className="flex justify-between text-sm font-medium" style={{ color: BLACK }}>
            <span>Subtotale</span>
            <span>{euro(totals.subtotale)}</span>
          </div>
          {totals.scontoValore > 0 && (
            <div className="flex justify-between text-sm font-medium" style={{ color: BLACK }}>
              <span>Sconto ({scontoPercent || 0}%)</span>
              <span>- {euro(totals.scontoValore)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-medium" style={{ color: BLACK }}>
            <span>Imponibile</span>
            <span>{euro(totals.imponibile)}</span>
          </div>
          <div className="flex justify-between text-sm font-medium" style={{ color: BLACK }}>
            <span>IVA ({totals.ivaPercent}%)</span>
            <span>{euro(totals.ivaValore)}</span>
          </div>
          <div
            className="mt-1.5 pt-2 flex justify-between text-base font-extrabold"
            style={{ borderTop: `1px solid ${GREEN}`, color: GREEN_DARK }}
          >
            <span>Totale</span>
            <span>{euro(totals.totale)}</span>
          </div>
        </section>

        {sendError && (
          <div
            className="flex items-center gap-2.5 rounded-2xl px-4 py-3.5"
            style={{ backgroundColor: DANGER_SOFT, color: DANGER }}
          >
            <AlertTriangle size={18} className="shrink-0" />
            <span className="text-sm font-semibold">{sendError}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={sending}
          className="mt-2 w-full rounded-2xl py-4 text-base font-bold text-white active:scale-[0.98] transition-transform disabled:opacity-60"
          style={{ backgroundColor: GREEN }}
        >
          {sending ? "Invio in corso..." : "Invia Preventivo"}
        </button>
      </form>
    </div>
  );
}

function SuccessScreen() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-8 text-center"
      style={{ backgroundColor: WHITE }}
    >
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: GREEN_SOFT }}
      >
        <Check size={36} style={{ color: GREEN_DARK }} strokeWidth={3} />
      </div>
      <h2 className="mt-6 text-xl font-extrabold" style={{ color: BLACK }}>
        Preventivo inviato
      </h2>
      <p className="mt-1.5 text-[15px] font-semibold" style={{ color: GREEN_DARK }}>
        con successo su Telegram!
      </p>
      <p className="mt-6 text-xs font-medium" style={{ color: GRAY }}>
        Ritorno alla schermata iniziale...
      </p>
    </div>
  );
}
