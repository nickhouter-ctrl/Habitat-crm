import path from "node:path";
import {
  Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer,
} from "@react-pdf/renderer";
import { COMPANY } from "@/lib/company";

const FONT_DIR = path.join(process.cwd(), "public", "fonts", "sora");
Font.register({ family: "Sora", fonts: [
  { src: path.join(FONT_DIR, "Sora-Regular.ttf"), fontWeight: 400 },
  { src: path.join(FONT_DIR, "Sora-Medium.ttf"), fontWeight: 500 },
  { src: path.join(FONT_DIR, "Sora-SemiBold.ttf"), fontWeight: 600 },
] });

export type StockCatalogItem = {
  name: string; sku: string | null; category: string | null; unit: string | null;
  quantity: number; price: number | null; vatRate: number; image: string | null;
  dimensions: string | null;
};

const s = StyleSheet.create({
  page: { fontFamily: "Sora", fontSize: 9, color: COMPANY.charcoal, paddingTop: 38, paddingBottom: 48, paddingHorizontal: 38, backgroundColor: "#fff" },
  top: { height: 4, backgroundColor: COMPANY.terracotta, position: "absolute", top: 0, left: 0, right: 0 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderBottomWidth: 1, borderBottomColor: COMPANY.sand, paddingBottom: 10, marginBottom: 18 },
  brand: { fontSize: 11, fontWeight: 600, letterSpacing: 1.3, color: COMPANY.brown },
  date: { fontSize: 8, color: COMPANY.muted },
  title: { fontSize: 25, fontWeight: 600, color: COMPANY.brown, marginBottom: 4 },
  intro: { fontSize: 9, color: COMPANY.muted, marginBottom: 17 },
  meta: { flexDirection: "row", justifyContent: "space-between", padding: 10, backgroundColor: "#f7f3ec", marginBottom: 16 },
  metaLabel: { fontSize: 7, color: COMPANY.muted }, metaValue: { fontSize: 10, fontWeight: 600, color: COMPANY.brown, marginTop: 3 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  card: { width: "48.7%", minHeight: 146, borderWidth: 0.8, borderColor: COMPANY.sand, borderRadius: 5, marginBottom: 12, padding: 9, flexDirection: "row" },
  image: { width: 104, height: 126, objectFit: "cover", backgroundColor: "#f1eee8", borderRadius: 3, marginRight: 10 },
  noImage: { width: 104, height: 126, backgroundColor: "#f1eee8", borderRadius: 3, marginRight: 10, alignItems: "center", justifyContent: "center" },
  noImageText: { fontSize: 7, color: COMPANY.muted },
  detail: { flex: 1, justifyContent: "space-between" },
  category: { fontSize: 7, color: COMPANY.terracotta, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 4 },
  name: { fontSize: 10, fontWeight: 600, color: COMPANY.brown, lineHeight: 1.3, marginBottom: 4 },
  sku: { fontSize: 7, color: COMPANY.muted, marginBottom: 5 },
  dim: { fontSize: 7.5, color: COMPANY.charcoal, marginBottom: 5 },
  stockLabel: { fontSize: 7, color: COMPANY.muted },
  stock: { fontSize: 10, fontWeight: 600, color: COMPANY.sage, marginTop: 2 },
  pricebox: { borderTopWidth: 0.7, borderTopColor: COMPANY.sand, paddingTop: 6, marginTop: 7 },
  price: { fontSize: 9, fontWeight: 600, color: COMPANY.brown },
  priceHint: { fontSize: 6.5, color: COMPANY.muted, marginTop: 2 },
  footer: { position: "absolute", bottom: 20, left: 38, right: 38, paddingTop: 6, borderTopWidth: 0.6, borderTopColor: COMPANY.sand, flexDirection: "row", justifyContent: "space-between", color: COMPANY.muted, fontSize: 7 },
});

function euro(value: number, locale: string) {
  return new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(value);
}

function Catalog({ items, locale, generatedAt }: { items: StockCatalogItem[]; locale: string; generatedAt: Date }) {
  const copy = locale === "es"
    ? { title: "Productos disponibles", intro: "Productos con existencias disponibles · precios de venta", count: "Productos", units: "Unidades disponibles", ex: "sin IVA", inc: "IVA incluido", stock: "Disponible", noImage: "Sin foto", footer: "Existencias en el momento de generar este documento" }
    : locale === "en"
      ? { title: "Products in stock", intro: "Products currently available · selling prices", count: "Products", units: "Units available", ex: "excl. VAT", inc: "incl. VAT", stock: "Available", noImage: "No photo", footer: "Stock snapshot at the time this document was generated" }
      : { title: "Producten op voorraad", intro: "Producten die nu beschikbaar zijn · verkoopprijzen", count: "Producten", units: "Stuks beschikbaar", ex: "excl. btw", inc: "incl. btw", stock: "Beschikbaar", noImage: "Geen foto", footer: "Voorraadmomentopname op het tijdstip waarop dit document is gemaakt" };
  const units = items.reduce((sum, item) => sum + item.quantity, 0);
  return <Document title={copy.title} author={COMPANY.name}>
    <Page size="A4" style={s.page} wrap>
      <View style={s.top} fixed />
      <View style={s.header} fixed><Text style={s.brand}>HABITAT ONE</Text><Text style={s.date}>{generatedAt.toLocaleDateString(locale)}</Text></View>
      <Text style={s.title}>{copy.title}</Text><Text style={s.intro}>{copy.intro}</Text>
      <View style={s.meta} wrap={false}><View><Text style={s.metaLabel}>{copy.count}</Text><Text style={s.metaValue}>{items.length}</Text></View><View><Text style={s.metaLabel}>{copy.units}</Text><Text style={s.metaValue}>{units.toLocaleString(locale)}</Text></View></View>
      <View style={s.grid}>
        {items.map((item, index) => <View key={`${item.sku ?? item.name}-${index}`} style={s.card} wrap={false}>
          {item.image ? (
            // @react-pdf/renderer images are PDF primitives, not accessible HTML images.
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={item.image} style={s.image} />
          ) : <View style={s.noImage}><Text style={s.noImageText}>{copy.noImage}</Text></View>}
          <View style={s.detail}>
            <View>
              {item.category && <Text style={s.category}>{item.category}</Text>}
              <Text style={s.name}>{item.name}</Text>
              {item.sku && <Text style={s.sku}>SKU {item.sku}</Text>}
              {item.dimensions && <Text style={s.dim}>{item.dimensions}</Text>}
              <Text style={s.stockLabel}>{copy.stock}</Text><Text style={s.stock}>{item.quantity.toLocaleString(locale)}{item.unit ? ` ${item.unit}` : ""}</Text>
            </View>
            {item.price != null && <View style={s.pricebox}>
              <Text style={s.price}>{euro(item.price, locale)} <Text style={s.priceHint}>{copy.ex}</Text></Text>
              <Text style={s.priceHint}>{euro(item.price * (1 + item.vatRate / 100), locale)} {copy.inc}</Text>
            </View>}
          </View>
        </View>)}
      </View>
      <View style={s.footer} fixed><Text>{COMPANY.name} · {COMPANY.website}</Text><Text>{copy.footer}</Text></View>
    </Page>
  </Document>;
}

export function renderProductStockCatalog(args: { items: StockCatalogItem[]; locale: string; generatedAt?: Date }) {
  return renderToBuffer(<Catalog {...args} generatedAt={args.generatedAt ?? new Date()} />);
}
