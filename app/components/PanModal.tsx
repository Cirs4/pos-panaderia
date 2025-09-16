"use client";
import { useState } from "react";

function parseNumberOrZero(v: string) {
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export default function PanModal({
  open,
  onClose,
  onAdd,
  pricePerKg,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (priceFinal: number) => void;
  pricePerKg: number; // ARS por kilo
}) {
  const [mode, setMode] = useState<"precio" | "peso">("precio");
  const [precio, setPrecio] = useState("");
  const [gramos, setGramos] = useState("");

  if (!open) return null;

  const confirmar = () => {
    if (mode === "precio") {
      const p = parseNumberOrZero(precio);
      if (p > 0) onAdd(p);
    } else {
      const g = parseNumberOrZero(gramos);
      if (g > 0) {
        const precioFinal = (g / 1000) * pricePerKg;
        onAdd(Math.round(precioFinal));
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-4 w-[92%] max-w-md shadow-xl">
        <h3 className="text-lg font-semibold mb-3">Agregar Pan</h3>

        <div className="flex gap-2 mb-3">
          <button
            className={`px-3 py-1 rounded ${mode === "precio" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            onClick={() => setMode("precio")}
          >
            Ingresar PRECIO
          </button>
          <button
            className={`px-3 py-1 rounded ${mode === "peso" ? "bg-blue-500 text-white" : "bg-gray-200"}`}
            onClick={() => setMode("peso")}
          >
            Ingresar PESO (gramos)
          </button>
        </div>

        {mode === "precio" ? (
          <input
            autoFocus
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Precio final (ej: 800)"
            className="w-full border rounded p-2 mb-3"
            value={precio}
            onChange={(e) => setPrecio(e.target.value.replace(/[^\d.,]/g, ""))}
          />
        ) : (
          <>
            <p className="text-sm text-gray-600 mb-1">
              Precio por kilo configurado: ${pricePerKg}/kg
            </p>
            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="Gramos (ej: 250 para 1/4 kg)"
              className="w-full border rounded p-2 mb-3"
              value={gramos}
              onChange={(e) => setGramos(e.target.value.replace(/[^\d]/g, ""))}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <button className="px-3 py-1 rounded border" onClick={onClose}>Cancelar</button>
          <button className="px-3 py-1 rounded bg-blue-500 text-white" onClick={confirmar}>Agregar</button>
        </div>
      </div>
    </div>
  );
}
