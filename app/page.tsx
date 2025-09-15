
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { auth, db } from "@/lib/firebase";
import { toast } from "sonner";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";

type Product = {
  code: string;
  name: string;
  cost: number;
  margin: number;
  stock: number;
  lowThreshold?: number;
};

type SaleItem = { code: string; name: string; qty: number; price: number };
type Sale = { id: string; at: string; items: SaleItem[]; total: number };

function peso(n: number | string) {
  const num = Number(n || 0);
  return num.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}
function fmtDateTime(iso: string | Date) {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("es-AR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
function calcPrice(cost: number, margin: number) {
  const c = Number(cost || 0);
  const m = Number(margin || 0);
  return Math.round(c * (1 + m / 100));
}

function useAuthSession() {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<any>(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => { setUser(u); setReady(true); });
    return () => unsub();
  }, []);
  return { ready, user };
}

function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  useEffect(() => {
    const qy = query(collection(db, "products"));
    const unsub = onSnapshot(qy, (snap) => {
      const arr: Product[] = [];
      snap.forEach((d) => arr.push(d.data() as Product));
      arr.sort((a, b) => a.name.localeCompare(b.name));
      setProducts(arr);
    });
    return () => unsub();
  }, []);
  return products;
}

function useSales() {
  const [sales, setSales] = useState<Sale[]>([]);
  useEffect(() => {
    const qy = query(collection(db, "sales"), orderBy("at", "desc"));
    const unsub = onSnapshot(qy, (snap) => {
      const arr: Sale[] = [];
      snap.forEach((d) => {
        const data: any = d.data();
        arr.push({
          id: d.id,
          at: data.at?.toDate?.()?.toISOString?.() || new Date().toISOString(),
          items: data.items || [],
          total: data.total || 0,
        });
      });
      setSales(arr);
    });
    return () => unsub();
  }, []);
  return [sales, setSales] as const;
}

function Login({ onLogin }: { onLogin: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (mode === "login") {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success("Sesión iniciada");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success("Usuario creado");
      }
      onLogin();
    } catch (err: any) {
      toast.error(err?.message || "Error de autenticación");
    }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-slate-50 p-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 border">
        <h1 className="text-2xl font-semibold mb-1">{mode === "login" ? "Iniciar sesión" : "Crear usuario"}</h1>
        <p className="text-slate-500 mb-4">{mode === "login" ? "Ingresá tus credenciales" : "Habilitá Email/Password en Firebase Auth"}</p>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm">Email</label>
            <input className="w-full border rounded-lg p-2 mt-1" placeholder="usuario@dominio.com" value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm">Contraseña</label>
            <input type="password" className="w-full border rounded-lg p-2 mt-1" placeholder="••••••••" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-2">
            <button className="flex-1 bg-black text-white rounded-lg py-2">{
              mode === "login" ? "Entrar" : "Crear y entrar"
            }</button>
            <button type="button" className="flex-1 border rounded-lg py-2" onClick={()=>setMode(mode==="login"?"signup":"login")}>
              {mode === "login" ? "Crear usuario" : "Ya tengo usuario"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function StockTab({ products }: { products: Product[] }) {
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ name: "", code: "", cost: "", margin: 50, stock: 0, lowThreshold: "" as any });
  const price = calcPrice(Number(form.cost||0), Number(form.margin||0));

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return products;
    return products.filter((p) => [p.name, p.code].some((f) => String(f).toLowerCase().includes(t)));
  }, [products, q]);

  const addProduct = async () => {
    if (!form.name || !form.code) { toast.error("Completá nombre y código"); return; }
    const code = String(form.code).trim();
    const ref = doc(db, "products", code);
    const snap = await getDoc(ref);
    if (snap.exists()) { toast.error("Ya existe un producto con ese código"); return; }
    const payload: Product = {
      code,
      name: form.name.trim(),
      cost: Number(form.cost||0),
      margin: Number(form.margin||0),
      stock: Number(form.stock||0),
      lowThreshold: form.lowThreshold === "" ? undefined : Number(form.lowThreshold),
    };
    await setDoc(ref, payload);
    setForm({ name: "", code: "", cost: "", margin: 50, stock: 0, lowThreshold: "" });
    toast.success("Producto agregado");
  };

  const updateField = async (code: string, field: keyof Product, value: any) => {
    const ref = doc(db, "products", code);
    await updateDoc(ref, { [field]: field === "cost" || field === "margin" || field === "stock" || field === "lowThreshold" ? Number(value||0) : value });
  };

  const exportJSON = async () => {
    const rows = products;
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `productos_${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const importRef = useRef<HTMLInputElement>(null);
  const onImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const arr = JSON.parse(String(reader.result));
        if (!Array.isArray(arr)) throw new Error("Formato inválido");
        const writes = arr.map(async (p: any) => {
          const code = String(p.code).trim(); if (!code) return;
          const payload: Product = {
            code,
            name: String(p.name||"").trim(),
            cost: Number(p.cost||0),
            margin: Number(p.margin||0),
            stock: Number(p.stock||0),
            lowThreshold: p.lowThreshold != null ? Number(p.lowThreshold) : undefined,
          };
          await setDoc(doc(db, "products", code), payload, { merge: true });
        });
        await Promise.all(writes);
        toast.success("Productos importados");
      } catch {
        toast.error("No se pudo importar");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border p-4 shadow-sm md:col-span-2">
          <h2 className="text-lg font-semibold">Agregar producto</h2>
          <p className="text-sm text-slate-500 mb-3">El precio final se calcula con el margen.</p>
          <div className="grid sm:grid-cols-2 xl:grid-cols-8 gap-3">
            <div className="xl:col-span-2">
              <label className="text-sm">Producto</label>
              <input className="w-full border rounded-lg p-2 mt-1" value={form.name} onChange={(e)=>setForm({...form, name:e.target.value})} placeholder="Nombre" />
            </div>
            <div>
              <label className="text-sm">Código</label>
              <input className="w-full border rounded-lg p-2 mt-1" value={form.code} onChange={(e)=>setForm({...form, code:e.target.value})} placeholder="EAN/UPC" />
            </div>
            <div>
              <label className="text-sm">Coste</label>
              <input type="number" className="w-full border rounded-lg p-2 mt-1" value={form.cost} onChange={(e)=>setForm({...form, cost:e.target.value})} placeholder="$" />
            </div>
            <div>
              <label className="text-sm">Margen %</label>
              <input type="number" className="w-full border rounded-lg p-2 mt-1" value={form.margin} onChange={(e)=>setForm({...form, margin:Number(e.target.value||0)})} />
            </div>
            <div>
              <label className="text-sm">Stock inicial</label>
              <input type="number" className="w-full border rounded-lg p-2 mt-1" value={form.stock} onChange={(e)=>setForm({...form, stock:Number(e.target.value||0)})} />
            </div>
            <div>
              <label className="text-sm">Umbral bajo (opcional)</label>
              <input type="number" className="w-full border rounded-lg p-2 mt-1" value={form.lowThreshold} onChange={(e)=>setForm({...form, lowThreshold:e.target.value})} />
            </div>
            <div>
              <label className="text-sm">Precio final</label>
              <input className="w-full border rounded-lg p-2 mt-1 bg-slate-100" value={price} readOnly />
            </div>
            <div className="flex gap-2 items-end">
              <button onClick={addProduct} className="bg-black text-white rounded-lg px-4 py-2">Agregar</button>
              <button onClick={exportJSON} className="border rounded-lg px-4 py-2">Exportar</button>
              <input type="file" accept="application/json" ref={importRef} className="hidden" onChange={onImport} />
              <button onClick={()=>importRef.current?.click()} className="border rounded-lg px-4 py-2">Importar</button>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-2xl border p-4 shadow-sm">
          <h3 className="text-lg font-semibold">Buscar</h3>
          <p className="text-sm text-slate-500 mb-3">Filtrá por nombre o código.</p>
          <input className="w-full border rounded-lg p-2" placeholder="Buscar..." value={q} onChange={(e)=>setQ(e.target.value)} />
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-1">Listado de productos</h2>
        <p className="text-sm text-slate-500 mb-3">Podés editar coste, margen y stock. El precio recalcula solo.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Producto</th>
                <th className="py-2">Código</th>
                <th className="py-2 text-right">Coste</th>
                <th className="py-2 text-right">Margen %</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-right">Stock actual</th>
                <th className="py-2 text-right">Umbral</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.code} className={`${p.stock <= (p.lowThreshold ?? 999999) ? "bg-red-50" : ""} border-b`}>
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 font-mono">{p.code}</td>
                  <td className="py-2 text-right">
                    <input type="number" className="w-28 border rounded-lg p-1 text-right"
                      value={p.cost} onChange={(e)=>updateField(p.code, "cost", e.target.value)} />
                  </td>
                  <td className="py-2 text-right">
                    <input type="number" className="w-24 border rounded-lg p-1 text-right"
                      value={p.margin} onChange={(e)=>updateField(p.code, "margin", e.target.value)} />
                  </td>
                  <td className="py-2 text-right">{peso(calcPrice(p.cost, p.margin))}</td>
                  <td className="py-2 text-right">
                    <input type="number" className="w-24 border rounded-lg p-1 text-right"
                      value={p.stock} onChange={(e)=>updateField(p.code, "stock", e.target.value)} />
                  </td>
                  <td className="py-2 text-right">
                    <input type="number" className="w-20 border rounded-lg p-1 text-right"
                      value={p.lowThreshold ?? ""} onChange={(e)=>updateField(p.code, "lowThreshold", e.target.value)} />
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-slate-500 py-6">Sin resultados</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function POSTab({ products, onSaleRecorded }: { products: Product[]; onSaleRecorded: (s: Sale) => void }) {
  const [scan, setScan] = useState("");
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [undoStack, setUndoStack] = useState<any[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const productsMap = useMemo(() => new Map(products.map(p => [p.code, p])), [products]);

  const addByCode = (code: string, qty = 1) => {
    const prod = productsMap.get(String(code).trim());
    if (!prod) { toast.error("Código no encontrado"); return; }
    const existingQty = cart.find(i => i.code === prod.code)?.qty || 0;
    if ((existingQty + qty) > (prod.stock || 0)) { toast.error(`Stock insuficiente de ${prod.name}`); return; }
    const price = calcPrice(prod.cost, prod.margin);
    setCart((prev) => {
      const idx = prev.findIndex((i) => i.code === prod.code);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + qty };
        return next;
      }
      return [{ code: prod.code, name: prod.name, price, qty }, ...prev];
    });
    setUndoStack((s) => [{ type: "add", code, qty }, ...s]);
  };

  const total = useMemo(() => cart.reduce((acc, i) => acc + i.price * i.qty, 0), [cart]);

  const onScanEnter = (e: any) => {
    e.preventDefault();
    const code = scan.trim();
    if (!code) return;
    addByCode(code, 1);
    setScan("");
  };

  const changeQty = (code: string, qty: number) => {
    const prod = productsMap.get(code);
    if (!prod) return;
    const q = Math.max(1, Number(qty||1));
    if (q > (prod.stock || 0)) { toast.error(`Stock insuficiente de ${prod.name}`); return; }
    setCart((prev) => prev.map((i) => (i.code === code ? { ...i, qty: q } : i)));
  };

  const removeItem = (code: string) => {
    setCart((prev) => prev.filter((i) => i.code !== code));
  };

  const cancelAll = () => {
    setCart([]);
    setUndoStack([]);
  };

  const undo = () => {
    const last = undoStack[0];
    if (!last) return;
    setUndoStack((s) => s.slice(1));
    if (last.type === "add") {
      setCart((prev) => {
        const idx = prev.findIndex((i) => i.code === last.code);
        if (idx < 0) return prev;
        const item = prev[idx];
        const newQty = item.qty - last.qty;
        if (newQty <= 0) return prev.filter((i) => i.code !== last.code);
        const next = [...prev];
        next[idx] = { ...item, qty: newQty };
        return next;
      });
    }
  };

  const cobrar = async () => {
    if (cart.length === 0) { toast.error("No hay productos"); return; }
    try {
      await runTransaction(db, async (tx) => {
        for (const item of cart) {
          const ref = doc(db, "products", item.code);
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error(`Producto no encontrado: ${item.code}`);
          const p = snap.data() as Product;
          if ((p.stock || 0) < item.qty) throw new Error(`Stock insuficiente de ${p.name}`);
          tx.update(ref, { stock: (p.stock || 0) - item.qty });
        }
        const saleRef = doc(collection(db, "sales"));
        tx.set(saleRef, { at: serverTimestamp(), items: cart, total });
      });
      const sale: Sale = { id: crypto.randomUUID(), at: new Date().toISOString(), items: cart, total };
      toast.success("Venta registrada");
      onSaleRecorded(sale);
      setCart([]);
      setUndoStack([]);
      inputRef.current?.focus();
    } catch (err: any) {
      toast.error(err?.message || "No se pudo registrar la venta");
    }
  };

  return (
    <div className="grid xl:grid-cols-3 gap-6">
      <div className="bg-white rounded-2xl border p-4 shadow-sm xl:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">Terminal de Punto de Venta</h2>
            <p className="text-sm text-slate-500">Escaneá o escribí el código y presioná Enter.</p>
          </div>
          <div className="flex gap-2 items-center">
            <input
              ref={inputRef}
              value={scan}
              onChange={(e)=>setScan(e.target.value)}
              onKeyDown={(e)=>{ if (e.key === "Enter") onScanEnter(e); }}
              placeholder="Código de barras"
              className="border rounded-lg p-2 w-56"
            />
            <button onClick={onScanEnter} className="bg-black text-white rounded-lg px-4 py-2">Agregar</button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Producto</th>
                <th className="py-2 text-right">Precio</th>
                <th className="py-2 text-center">Cantidad</th>
                <th className="py-2 text-right">Subtotal</th>
                <th className="py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {cart.map((i) => (
                <tr key={i.code} className="border-b">
                  <td className="py-2">
                    <div className="flex flex-col">
                      <span>{i.name}</span>
                      <span className="text-xs text-slate-500">Stock disp.: {productsMap.get(i.code)?.stock ?? 0}</span>
                    </div>
                  </td>
                  <td className="py-2 text-right">{peso(i.price)}</td>
                  <td className="py-2 text-center">
                    <input type="number" className="w-24 border rounded-lg p-1 text-center"
                      value={i.qty} onChange={(e)=>changeQty(i.code, Number(e.target.value))} />
                  </td>
                  <td className="py-2 text-right">{peso(i.price * i.qty)}</td>
                  <td className="py-2 text-right">
                    <button className="border rounded-lg px-3 py-1" onClick={()=>removeItem(i.code)}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr><td colSpan={5} className="text-center text-slate-500 py-6">No hay productos en la venta</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      <div className="bg-white rounded-2xl border p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-3">Resumen</h3>
        <div className="flex justify-between text-lg mb-3">
          <span>Total</span>
          <span className="font-semibold text-2xl">{peso(total)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="border rounded-lg py-2" onClick={undo}>Atrás</button>
          <button className="border rounded-lg py-2" onClick={cancelAll}>Cancelar</button>
          <button className="col-span-2 bg-black text-white rounded-lg py-2" onClick={cobrar}>Cobrar</button>
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ sales }: { sales: Sale[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return sales;
    return sales.filter((s) => s.items.some((i) => i.name.toLowerCase().includes(t) || i.code.includes(t)) || fmtDateTime(s.at).includes(t));
  }, [q, sales]);

  const exportCSV = () => {
    const rows = [
      ["fecha_hora","codigo","producto","cantidad","precio_unit","subtotal","total_venta","id_venta"],
      ...sales.flatMap((s) => s.items.map((i) => [fmtDateTime(s.at), i.code, i.name, i.qty, i.price, i.price*i.qty, s.total, s.id]))
    ];
    const csv = rows.map(r => r.map(v => typeof v === "string" && v.includes(",") ? `"${v.replace(/"/g,'""')}"` : v).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `historial_${new Date().toISOString().slice(0,10)}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <input className="border rounded-lg p-2 flex-1" placeholder="Buscar por producto, código o fecha" value={q} onChange={(e)=>setQ(e.target.value)} />
        <button className="border rounded-lg px-4 py-2" onClick={exportCSV}>Exportar CSV</button>
      </div>
      <div className="bg-white rounded-2xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-2">Historial de ventas</h2>
        <p className="text-sm text-slate-500 mb-3">{filtered.length} ventas</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Fecha</th>
                <th className="py-2">Detalle</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b">
                  <td className="py-2 whitespace-nowrap">{fmtDateTime(s.at)}</td>
                  <td className="py-2">
                    <ul className="list-disc pl-5 text-sm text-slate-700">
                      {s.items.map((i) => (
                        <li key={i.code}>{i.name} x{i.qty} — {peso(i.price)} c/u = {peso(i.price*i.qty)}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="py-2 text-right font-semibold">{peso(s.total)}</td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={3} className="text-center text-slate-500 py-6">Sin ventas registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ onLogout }: { onLogout: () => void }) {
  const [low, setLow] = useState<number>(5);
  const [lowProducts, setLowProducts] = useState<Product[]>([]);

  useEffect(() => {
    const ref = doc(db, "settings", "config");
    const unsub = onSnapshot(ref, (d) => {
      const data = d.data() as any;
      if (data?.lowStockThreshold != null) setLow(Number(data.lowStockThreshold));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "products"), (snap) => {
      const arr: Product[] = [];
      snap.forEach((d) => arr.push(d.data() as Product));
      const list = arr.filter(p => p.stock <= (p.lowThreshold ?? low));
      list.sort((a,b) => (a.stock - (a.lowThreshold ?? low)) - (b.stock - (b.lowThreshold ?? low)));
      setLowProducts(list);
    });
    return () => unsub();
  }, [low]);

  const save = async () => {
    const ref = doc(db, "settings", "config");
    await setDoc(ref, { lowStockThreshold: Number(low||0) }, { merge: true });
    toast.success("Umbral de stock bajo actualizado");
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border p-4 shadow-sm">
        <h2 className="text-lg font-semibold mb-1">Configuración</h2>
        <p className="text-sm text-slate-500 mb-3">Umbral de stock bajo (global)</p>
        <div className="flex items-center gap-2">
          <input type="number" className="w-32 border rounded-lg p-2" value={low} onChange={(e)=>setLow(Number(e.target.value||0))} />
          <button onClick={save} className="bg-black text-white rounded-lg px-4 py-2">Guardar</button>
          <button onClick={onLogout} className="border rounded-lg px-4 py-2">Cerrar sesión</button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-4 shadow-sm">
        <h3 className="text-lg font-semibold mb-2">Stock bajo</h3>
        <p className="text-sm text-slate-500 mb-3">Productos con stock ≤ umbral</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2">Producto</th>
                <th className="py-2">Código</th>
                <th className="py-2 text-right">Stock</th>
                <th className="py-2 text-right">Umbral</th>
              </tr>
            </thead>
            <tbody>
              {lowProducts.map((p) => (
                <tr key={p.code} className="border-b">
                  <td className="py-2">{p.name}</td>
                  <td className="py-2 font-mono">{p.code}</td>
                  <td className="py-2 text-right">{p.stock}</td>
                  <td className="py-2 text-right">{p.lowThreshold ?? low}</td>
                </tr>
              ))}
              {lowProducts.length === 0 && (
                <tr><td colSpan={4} className="text-center text-slate-500 py-6">No hay productos con stock bajo</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { ready, user } = useAuthSession();
  const products = useProducts();
  const [sales, setSales] = useSales();
  const onSaleRecorded = (sale: Sale) => setSales((prev) => [sale, ...prev]);

  const [tab, setTab] = useState<"stock"|"pos"|"historial"|"ajustes">("pos");

  const logout = async () => { await signOut(auth); };

  if (!ready) return <div className="min-h-screen grid place-items-center text-slate-500">Cargando…</div>;
  if (!user) return <Login onLogin={()=>{}} />;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 bg-white/70 backdrop-blur border-b">
        <div className="max-w-7xl mx-auto p-4 flex items-center justify-between">
          <motion.h1 initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="text-2xl font-semibold tracking-tight">
            POS Panadería
          </motion.h1>
          <div className="text-sm text-slate-600">Sesión: <strong>{user.email}</strong></div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto p-4 space-y-6">
        <div className="grid grid-cols-4 gap-2 max-w-xl">
          <button className={`rounded-lg py-2 border ${tab==="stock"?"bg-black text-white":""}`} onClick={()=>setTab("stock")}>Stock</button>
          <button className={`rounded-lg py-2 border ${tab==="pos"?"bg-black text-white":""}`} onClick={()=>setTab("pos")}>Punto de Venta</button>
          <button className={`rounded-lg py-2 border ${tab==="historial"?"bg-black text-white":""}`} onClick={()=>setTab("historial")}>Historial</button>
          <button className={`rounded-lg py-2 border ${tab==="ajustes"?"bg-black text-white":""}`} onClick={()=>setTab("ajustes")}>Ajustes</button>
        </div>
        {tab==="stock" && <StockTab products={products} />}
        {tab==="pos" && <POSTab products={products} onSaleRecorded={onSaleRecorded} />}
        {tab==="historial" && <HistoryTab sales={sales} />}
        {tab==="ajustes" && <SettingsTab onLogout={logout} />}
      </main>
      <footer className="max-w-7xl mx-auto p-4 text-xs text-slate-500">
        Datos en Firestore (nube). Recordá agregar tu dominio de Vercel a “Dominios autorizados” en Firebase Auth.
      </footer>
    </div>
  );
}
