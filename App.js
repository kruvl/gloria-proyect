// App.js — Expo React Native (iOS + Android)
// Funciona en Expo Go. Incluye:
// - Formulario (fecha, referencia)
// - Tabla dinámica de ítems (descripción, cantidad, vr. unitario, vr. total automático)
// - Cálculo de totales + IVA (editable)
// - Exportación a PDF manteniendo el estilo del Excel (HTML/CSS)
// - Guardado opcional local (AsyncStorage) de cotizaciones
//
// Cómo probar rápido:
// 1) Instala Expo CLI opcionalmente (npm i -g expo) o usa https://snack.expo.dev y pega este archivo como App.js.
// 2) Añade dependencias en Snack o en app.json/package.json: "expo-print" y "expo-sharing" y "@react-native-async-storage/async-storage".
// 3) Abre la app con Expo Go en Android/iPhone. Completa el formulario y pulsa "Exportar PDF".

import { LOGO_BASE64 } from "./logo";
import { BOTTOM_BASE64 } from "./bottom";


import React, { useMemo, useState, useEffect } from 'react';
import { SafeAreaView, View, Text, TextInput, TouchableOpacity, FlatList, Alert, ScrollView, Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

const currencyCOP = (n) =>
  (Number(n) || 0).toLocaleString('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });

const parseNumber = (v) => {
  if (typeof v === 'number') return v;
  const s = (v || '').toString().replace(/[^0-9.,]/g, '').replace(/\./g, '').replace(/,/g, '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

export default function App() {
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [referencia, setReferencia] = useState('');
  const [ivaPct, setIvaPct] = useState('0'); // puedes cambiar a 19 si aplica
  const [items, setItems] = useState([
    { id: '1', descripcion: '', cantidad: '1', unitario: '0' },
  ]);
  const [saving, setSaving] = useState(false);
  const [savedList, setSavedList] = useState([]);

  useEffect(() => { loadSaved(); }, []);

  const addItem = () => {
    setItems((prev) => [...prev, { id: Date.now().toString(), descripcion: '', cantidad: '1', unitario: '0' }]);
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, [field]: value } : it)));
  };

  const totals = useMemo(() => {
    const rows = items.map((it) => ({
      ...it,
      cantidadNum: parseNumber(it.cantidad),
      unitarioNum: parseNumber(it.unitario),
      total: parseNumber(it.cantidad) * parseNumber(it.unitario),
    }));
    const subtotal = rows.reduce((acc, r) => acc + r.total, 0);
    const iva = subtotal * (parseNumber(ivaPct) / 100);
    const total = subtotal + iva;
    return { rows, subtotal, iva, total };
  }, [items, ivaPct]);

  const validate = () => {
    if (!fecha) return 'La fecha es obligatoria';
    if (!referencia.trim()) return 'La referencia es obligatoria';
    if (items.length === 0) return 'Agrega al menos un ítem';
    for (const it of items) {
      if (!it.descripcion.trim()) return 'Cada ítem debe tener descripción';
      if (parseNumber(it.cantidad) <= 0) return 'La cantidad debe ser mayor que 0';
      if (parseNumber(it.unitario) < 0) return 'El valor unitario no puede ser negativo';
    }
    return null;
  };

  const handleExport = async () => {
    const err = validate();
    if (err) { Alert.alert('Revisa los datos', err); return; }

    const html = buildHTML({ fecha, referencia, ivaPct, ...totals });
    try {
      const { uri } = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { dialogTitle: 'Compartir cotización PDF' });
      } else {
        Alert.alert('PDF generado', `Guardado en: ${uri}`);
      }
    } catch (e) {
      Alert.alert('Error al generar PDF', e?.message || 'Intenta de nuevo');
    }
  };

  const saveQuote = async () => {
    const err = validate();
    if (err) { Alert.alert('Revisa los datos', err); return; }
    setSaving(true);
    try {
      const key = `quote_${Date.now()}`;
      const data = { key, fecha, referencia, ivaPct, items, createdAt: new Date().toISOString() };
      await AsyncStorage.setItem(key, JSON.stringify(data));
      await loadSaved();
      Alert.alert('Guardado', 'La cotización fue guardada localmente.');
    } catch (e) {
      Alert.alert('Error', 'No se pudo guardar.');
    } finally { setSaving(false); }
  };

  const loadSaved = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const qkeys = keys.filter((k) => k.startsWith('quote_'));
      const pairs = await AsyncStorage.multiGet(qkeys);
      const list = pairs.map(([, v]) => JSON.parse(v)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      setSavedList(list);
    } catch (e) { /* ignore */ }
  };

  const loadOne = async (data) => {
    setFecha((data.fecha || '').slice(0, 10));
    setReferencia(data.referencia || '');
    setIvaPct(data.ivaPct?.toString?.() || '0');
    setItems(data.items?.length ? data.items : [{ id: '1', descripcion: '', cantidad: '1', unitario: '0' }]);
    Alert.alert('Cargado', 'Se cargó la cotización seleccionada.');
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f8fafc' }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 12 }}>Cotización</Text>

        {/* Fecha */}
        <Text style={{ fontSize: 12, marginBottom: 4 }}>Fecha</Text>
        <TextInput
          value={fecha}
          onChangeText={setFecha}
          placeholder="YYYY-MM-DD"
          style={styles.input}
        />

        {/* Texto fijo + Referencia */}
        <Text style={{ marginTop: 12, marginBottom: 8 }}>
          De acuerdo a su amable solicitud enviamos a Ustedes Cotización del trabajo en referencia:
        </Text>
        <TextInput
          value={referencia}
          onChangeText={setReferencia}
          placeholder="Referencia del trabajo"
          style={styles.input}
        />

        {/* IVA */}
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center', marginTop: 8 }}>
          <Text>IVA (%)</Text>
          <TextInput
            value={ivaPct}
            onChangeText={setIvaPct}
            keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric' })}
            style={[styles.input, { flex: 0, width: 100 }]}
          />
        </View>

        {/* Tabla */}
        <Text style={{ fontSize: 18, fontWeight: '600', marginTop: 16, marginBottom: 8 }}>Detalle</Text>
        <HeaderRow />
        <FlatList
          scrollEnabled={false}
          data={items}
          keyExtractor={(it) => it.id}
          renderItem={({ item }) => (
            <ItemRow
              item={item}
              onChange={(field, val) => updateItem(item.id, field, val)}
              onRemove={() => removeItem(item.id)}
            />
          )}
          ListFooterComponent={(<>
            <TouchableOpacity onPress={addItem} style={[styles.btn, { backgroundColor: '#0ea5e9' }]}>
              <Text style={styles.btnText}>+ Agregar fila</Text>
            </TouchableOpacity>
          </>)}
        />

        {/* Totales */}
        <View style={{ marginTop: 16, padding: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb' }}>
          <Row label="Subtotal" value={currencyCOP(totals.subtotal)} />
          <Row label={`IVA (${parseNumber(ivaPct)}%)`} value={currencyCOP(totals.iva)} />
          <Row label="Total" value={currencyCOP(totals.total)} bold />
        </View>

        {/* Acciones */}
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
          <TouchableOpacity onPress={handleExport} style={[styles.btn, { backgroundColor: '#22c55e' }]}>
            <Text style={styles.btnText}>Exportar PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity disabled={saving} onPress={saveQuote} style={[styles.btn, { backgroundColor: '#6366f1' }]}>
            <Text style={styles.btnText}>{saving ? 'Guardando…' : 'Guardar'}</Text>
          </TouchableOpacity>
        </View>

        {/* Guardados */}
        {savedList.length > 0 && (
          <View style={{ marginTop: 24 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Cotizaciones guardadas</Text>
            {savedList.map((q) => (
              <TouchableOpacity key={q.key} onPress={() => loadOne(q)} style={{ padding: 12, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 8 }}>
                <Text style={{ fontWeight: '600' }}>{q.referencia || '(sin referencia)'}</Text>
                <Text style={{ fontSize: 12, color: '#6b7280' }}>{new Date(q.createdAt).toLocaleString()}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, bold }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 4 }}>
      <Text style={{ fontWeight: bold ? '700' : '400' }}>{label}</Text>
      <Text style={{ fontWeight: bold ? '700' : '400' }}>{value}</Text>
    </View>
  );
}

function HeaderRow() {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', borderTopLeftRadius: 10, borderTopRightRadius: 10, borderWidth: 1, borderColor: '#e5e7eb' }}>
      <Cell flex={4}><Text style={styles.hcell}>DESCRIPCIÓN</Text></Cell>
      <Cell flex={1.5}><Text style={styles.hcell}>Cantidad</Text></Cell>
      <Cell flex={2}><Text style={styles.hcell}>Vr. Unitario</Text></Cell>
      <Cell flex={2}><Text style={styles.hcell}>Vr. Total</Text></Cell>
      <Cell flex={1}><Text style={styles.hcell}></Text></Cell>
    </View>
  );
}

function ItemRow({ item, onChange, onRemove }) {
  const total = parseNumber(item.cantidad) * parseNumber(item.unitario);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb' }}>
      <Cell flex={4}>
        <TextInput
          placeholder="Descripción"
          value={item.descripcion}
          onChangeText={(v) => onChange('descripcion', v)}
          style={styles.cellInput}
          multiline
        />
      </Cell>
      <Cell flex={1.5} center>
        <TextInput
          placeholder="0"
          keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric' })}
          value={item.cantidad}
          onChangeText={(v) => onChange('cantidad', v)}
          style={[styles.cellInput, { textAlign: 'center' }]}
        />
      </Cell>
      <Cell flex={2}>
        <TextInput
          placeholder="0"
          keyboardType={Platform.select({ ios: 'number-pad', android: 'numeric' })}
          value={item.unitario}
          onChangeText={(v) => onChange('unitario', v)}
          style={[styles.cellInput, { textAlign: 'right' }]}
        />
      </Cell>
      <Cell flex={2} center>
        <Text style={{ paddingHorizontal: 6 }}>{currencyCOP(total)}</Text>
      </Cell>
      <Cell flex={1} center>
        <TouchableOpacity onPress={onRemove} style={{ padding: 8 }}>
          <Text style={{ color: '#ef4444', fontWeight: '700' }}>X</Text>
        </TouchableOpacity>
      </Cell>
    </View>
  );
}

function Cell({ children, flex = 1, center }) {
  return (
    <View style={{ flex, padding: 8, justifyContent: center ? 'center' : 'flex-start' }}>
      {children}
    </View>
  );
}

const styles = {
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  btnText: { color: '#fff', fontWeight: '700' },
  hcell: { fontWeight: '700', fontSize: 12 },
  cellInput: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 6 },
};

function buildHTML({ fecha, referencia, ivaPct, rows, subtotal, iva, total }) {
  // HTML que simula el diseño de la hoja Excel (cabeceras, tabla, totales)
  // Ajusta colores/anchos según tu plantilla.
  const rowsHtml = rows.map((r, i) => `
    <tr>
      <td class="desc">${escapeHtml(r.descripcion)}</td>
      <td class="qty">${Number(r.cantidadNum) || 0}</td>
      <td class="money">${currencyCOP(r.unitarioNum)}</td>
      <td class="money">${currencyCOP(r.total)}</td>
    </tr>
  `).join('');

  return `
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 24px; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial; color: #111827; }
        .title { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
        .muted { color: #6b7280; }
        .box { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
        .row { display: flex; justify-content: space-between; margin: 4px 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
        th { text-align: left; background: #f1f5f9; }
        th, td { border: 1px solid #e5e7eb; padding: 8px; vertical-align: top; }
        .desc { width: 55%; }
        .qty { width: 10%; text-align: center; }
        .money { width: 17.5%; text-align: right; }
        .totals { margin-top: 12px; width: 100%; }
        .totals .label { text-align: right; padding-right: 8px; }
        .totals .val { text-align: right; font-weight: 600; }
      </style>
    </head>
    <body>
    <div style="text-align:center; margin-bottom:16px;">
  <img src="${LOGO_BASE64}" style="width:240px; height:auto;" />
  <div style="font-size:14px; margin-top:8px;">
    NIT. N.° 900-421730-1
  </div>
</div>

  <div class="box">
    <div class="row"><div class="title">COTIZACIÓN</div><div class="muted">Fecha: ${escapeHtml(fecha)}</div></div>

        <table>
          <thead>
            <tr>
              <th>DESCRIPCIÓN</th>
              <th>Cantidad</th>
              <th>Vr. Unitario</th>
              <th>Vr. Total</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>

        <table class="totals">
          <tr>
            <td class="label" colspan="3">Subtotal</td>
            <td class="val">${currencyCOP(subtotal)}</td>
          </tr>
          <tr>
            <td class="label" colspan="3">IVA (${Number(ivaPct) || 0}%)</td>
            <td class="val">${currencyCOP(iva)}</td>
          </tr>
          <tr>
            <td class="label" colspan="3"><strong>Total</strong></td>
            <td class="val"><strong>${currencyCOP(total)}</strong></td>
          </tr>
        </table>
      </div>

  <div style="margin-top:40px; text-align:left;">
  <div style="border-top:1px solid #111; width:220px; margin-bottom:8px;"></div>
  <img src="${BOTTOM_BASE64}" style="width:200px; height:auto;" />
</div>
    </body>
  </html>`;
}

function escapeHtml(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

