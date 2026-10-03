import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TextStyle, StyleProp, ScrollView } from 'react-native';
import { parseMathLabel, isPlainLabel, MathNode } from '@/utils/mathLabel';

// Renders label text such as "3π/4", "√2/2" or "(9 + √61) / 2" in textbook style:
// stacked fractions and a radical with an overline.
//
// Plain labels ("5", "-0.25", "NaN") return a single <Text> with no extra Views.
//
// Fine-tuning constants are BAR_THICKNESS and RADICAL_* below. Font metrics vary by device,
// so adjust only these if the radical bar does not sit flush with the √ sign.

const BAR_THICKNESS = 1.2;
/** Kök çizgisinin √ glyph'inin üstüne oturması için radicand'ı aşağı iten oran (× fontSize). */
const RADICAL_TOP_OFFSET = 0.13;
/** İç içe kesirlerde yazı boyutu çarpanı ve alt sınır. */
const NESTED_SCALE = 0.86;
const MIN_FONT = 9;

interface MathTextProps {
  text: string;
  color?: string;
  fontSize?: number;
  fontWeight?: TextStyle['fontWeight'];
  style?: StyleProp<TextStyle>;
}

interface RenderCtx {
  color?: string;
  fontSize: number;
  fontWeight?: TextStyle['fontWeight'];
  textStyle?: StyleProp<TextStyle>;
}

function renderNodes(nodes: MathNode[], ctx: RenderCtx, keyPrefix: string): React.ReactNode[] {
  const base: TextStyle = {
    fontSize: ctx.fontSize,
    lineHeight: Math.round(ctx.fontSize * 1.2),
    fontWeight: ctx.fontWeight,
    includeFontPadding: false,
    ...(ctx.color ? { color: ctx.color } : null),
  };

  return nodes.map((n, i) => {
    const key = `${keyPrefix}${i}`;

    if (n.type === 'text') {
      return (
        <Text key={key} style={[base, ctx.textStyle]}>
          {n.value}
        </Text>
      );
    }

    if (n.type === 'sqrt') {
      return (
        <View key={key} style={styles.sqrtRow}>
          <Text style={[base, ctx.textStyle]}>√</Text>
          <View
            style={{
              borderTopWidth: BAR_THICKNESS,
              borderTopColor: ctx.color ?? '#000',
              marginTop: Math.round(ctx.fontSize * RADICAL_TOP_OFFSET),
              paddingHorizontal: 1,
              flexDirection: 'row',
              alignItems: 'center',
            }}
          >
            {renderNodes(n.radicand, ctx, `${key}r`)}
          </View>
        </View>
      );
    }

    // İç içe kesirlerde okunabilirlik için hafif küçült.
    const inner: RenderCtx = { ...ctx, fontSize: Math.max(MIN_FONT, ctx.fontSize * NESTED_SCALE) };
    return (
      <View key={key} style={styles.frac}>
        <View style={styles.fracPart}>{renderNodes(n.num, inner, `${key}n`)}</View>
        <View style={[styles.fracBar, { backgroundColor: ctx.color ?? '#000', height: BAR_THICKNESS }]} />
        <View style={styles.fracPart}>{renderNodes(n.den, inner, `${key}d`)}</View>
      </View>
    );
  });
}

export default function MathText({ text, color, fontSize = 13, fontWeight = '600', style }: MathTextProps) {
  const plain = isPlainLabel(text);
  const nodes = useMemo(() => (plain ? [] : parseMathLabel(text)), [text, plain]);

  if (plain) {
    return (
      <Text style={[{ fontSize, fontWeight }, color ? { color } : null, style]}>{text}</Text>
    );
  }

  return (
    <View style={styles.row}>
      {renderNodes(nodes, { color, fontSize, fontWeight, textStyle: style }, 'm')}
    </View>
  );
}

// ------------------------------------------------------------
// MathList — "[a,  b,  c]" ve "v1 = [a,  b]" biçimli listeler
// ------------------------------------------------------------

interface MathListProps {
  items: string[];
  /** Köşeli parantezden önceki metin, örn. "v1 = " veya "x = ". */
  prefix?: string;
  color?: string;
  fontSize?: number;
  fontWeight?: TextStyle['fontWeight'];
}

export function MathList({ items, prefix = '', color, fontSize = 16, fontWeight = '600' }: MathListProps) {
  const textStyle: TextStyle = { fontSize, fontWeight, ...(color ? { color } : null) };
  // Çok uzun ifadeler (Cardano / trigonometrik / "k. kök" gösterimi) ekrana sığmaz: her öğe
  // kendi satırında, yatay kaydırılabilir olarak gösterilir.
  if (items.some((it) => it.length > 36)) {
    return (
      <View style={styles.longList}>
        <Text style={textStyle}>{`${prefix}[`}</Text>
        {items.map((it, i) => (
          <ScrollView key={i} horizontal showsHorizontalScrollIndicator style={styles.longItem}>
            <MathText text={it} color={color} fontSize={fontSize} fontWeight={fontWeight} />
            {i < items.length - 1 && <Text style={textStyle}>{','}</Text>}
          </ScrollView>
        ))}
        <Text style={textStyle}>]</Text>
      </View>
    );
  }
  return (
    <View style={styles.listRow}>
      <Text style={textStyle}>{`${prefix}[`}</Text>
      {items.map((it, i) => (
        <View key={i} style={styles.row}>
          <MathText text={it} color={color} fontSize={fontSize} fontWeight={fontWeight} />
          {i < items.length - 1 && <Text style={textStyle}>{',  '}</Text>}
        </View>
      ))}
      <Text style={textStyle}>]</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  longList: { marginBottom: 4 },
  longItem: { marginLeft: 12, marginVertical: 2 },
  listRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginBottom: 4 },
  sqrtRow: { flexDirection: 'row', alignItems: 'flex-start' },
  frac: { alignItems: 'center', marginHorizontal: 2 },
  fracPart: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3 },
  fracBar: { alignSelf: 'stretch' },
});
