import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AppTheme } from '@/theme/theme';
import { OperationType } from '@/types';
import { useTranslation } from '@/i18n/useTranslation';
import { TranslationKey } from '@/i18n/translations';

interface OperationOption {
  type: OperationType;
  labelKey: TranslationKey;
  needsTwoMatrices?: boolean;
  needsScalar?: boolean;
  needsExponent?: boolean;
  needsLinearSystem?: boolean;
}

interface OperationGroup {
  titleKey: TranslationKey;
  options: OperationOption[];
  collapsible?: boolean;
}

export const OPERATION_GROUPS: OperationGroup[] = [
  {
    titleKey: 'basicOps',
    options: [
      { type: 'add', labelKey: 'opAdd', needsTwoMatrices: true },
      { type: 'subtract', labelKey: 'opSubtract', needsTwoMatrices: true },
      { type: 'scalarMultiply', labelKey: 'opScalarMultiply', needsScalar: true },
      { type: 'multiply', labelKey: 'opMultiply', needsTwoMatrices: true },
    ],
  },
  {
    titleKey: 'advancedOps',
    collapsible: true,
    options: [
      { type: 'determinant', labelKey: 'opDeterminant' },
      { type: 'inverse', labelKey: 'opInverse' },
      { type: 'transpose', labelKey: 'opTranspose' },
      { type: 'trace', labelKey: 'opTrace' },
      { type: 'rank', labelKey: 'opRank' },
      { type: 'rref', labelKey: 'opRref' },
      { type: 'gaussElimination', labelKey: 'opGaussElimination' },
      { type: 'eigen', labelKey: 'opEigen' },
      { type: 'lu', labelKey: 'opLu' },
      { type: 'power', labelKey: 'opPower', needsExponent: true },
    ],
  },
  {
    titleKey: 'linearSystems',
    options: [{ type: 'solveLinearSystem', labelKey: 'opSolveLinearSystem', needsLinearSystem: true }],
  },
];

const HERMITIAN_OPTION: OperationOption = { type: 'hermitian', labelKey: 'opHermitian' };

/** KARMAŞIK SAYI MODU: gruplar/başlıklar olmadan, tek düz çip listesi. */
export const COMPLEX_MODE_OPERATIONS: OperationType[] = [
  'add',
  'subtract',
  'scalarMultiply',
  'multiply',
  'determinant',
  'inverse',
  'transpose',
  'hermitian',
  'trace',
  'eigen',
];

interface OperationSelectorProps {
  selected: OperationType;
  onSelect: (op: OperationType) => void;
  theme: AppTheme;
  complexMode?: boolean;
}

export default function OperationSelector({ selected, onSelect, theme, complexMode }: OperationSelectorProps) {
  const { t } = useTranslation();
  // İlk açılışta, seçili işlem "İleri İşlemler" grubundaysa kullanıcı onu
  // görebilsin diye grup açık başlar; ama bundan sonra tamamen kullanıcının
  // kontrolündedir - bir işlem seçili olsa bile küçültülebilir.
  const advancedGroup = OPERATION_GROUPS.find((g) => g.titleKey === 'advancedOps');
  const isAdvancedSelected = advancedGroup?.options.some((o) => o.type === selected) ?? false;
  const [advancedExpanded, setAdvancedExpanded] = useState(isAdvancedSelected);

  if (complexMode) {
    // Geçmişten yüklenen bir kayıt bu listede olmayan bir işlemse (ör. LU), seçili
    // işlem de görünsün diye listenin sonuna eklenir.
    const list = COMPLEX_MODE_OPERATIONS.includes(selected) ? COMPLEX_MODE_OPERATIONS : [...COMPLEX_MODE_OPERATIONS, selected];
    return (
      <View style={styles.group}>
        <View style={styles.chipGrid}>
          {list.map((type) => {
            const isSelected = selected === type;
            return (
              <TouchableOpacity
                accessibilityRole="button"
                key={type}
                accessibilityState={{ selected: isSelected }}
                onPress={() => onSelect(type)}
                style={[
                  styles.chip,
                  { backgroundColor: isSelected ? theme.primary : theme.surfaceAlt, borderColor: isSelected ? theme.primary : theme.border },
                ]}
              >
                <Text style={[styles.chipText, { color: isSelected ? '#FFFFFF' : theme.text }]}>{t(getOperationConfig(type).labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View>
      {OPERATION_GROUPS.map((group) => {
        const isCollapsible = group.collapsible;
        const groupIsAdvancedSelected = group.options.some((o) => o.type === selected);
        const isExpanded = !isCollapsible || advancedExpanded;

        // Seçili işlem bu gruptaysa, en başta gözükecek şekilde sırala.
        // Böylece grup küçültüldüğünde de (aşağıda) seçili işlem ilk
        // sırada, tek satırlık bir önizleme olarak görünür.
        const orderedOptions = groupIsAdvancedSelected
          ? [...group.options].sort((x, y) => (x.type === selected ? -1 : y.type === selected ? 1 : 0))
          : group.options;

        return (
          <View key={group.titleKey} style={styles.group}>
            <TouchableOpacity
              accessibilityRole={isCollapsible ? 'button' : undefined}
              accessibilityState={isCollapsible ? { expanded: isExpanded } : undefined}
              onPress={isCollapsible ? () => setAdvancedExpanded((v) => !v) : undefined}
              activeOpacity={isCollapsible ? 0.7 : 1}
              style={styles.groupHeader}
            >
              <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>
                {t(group.titleKey)}
              </Text>
              {isCollapsible && (
                <Text style={[styles.expandIcon, { color: theme.textSecondary }]}>
                  {isExpanded ? '▲' : '▼'}
                </Text>
              )}
            </TouchableOpacity>
            {(isExpanded || groupIsAdvancedSelected) && (
              <View style={styles.chipGrid}>
                {(isExpanded ? orderedOptions : orderedOptions.slice(0, 1)).map((opt) => {
                  const isSelected = selected === opt.type;
                  return (
                    <TouchableOpacity accessibilityRole="button"
                      key={opt.type}
                      accessibilityState={{ selected: isSelected }}
                      onPress={() => onSelect(opt.type)}
                      style={[
                        styles.chip,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surfaceAlt,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[styles.chipText, { color: isSelected ? '#FFFFFF' : theme.text }]}
                        numberOfLines={1}
                      >
                        {t(opt.labelKey)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

export function getOperationConfig(type: OperationType): OperationOption {
  for (const group of OPERATION_GROUPS) {
    const found = group.options.find((o) => o.type === type);
    if (found) return found;
  }
  if (type === 'hermitian') return HERMITIAN_OPTION;
  return { type, labelKey: 'opDeterminant' };
}

const styles = StyleSheet.create({
  group: { marginBottom: 14 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 },
  groupTitle: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  expandIcon: { fontSize: 11, fontWeight: '700' },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  chipText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.1 },
});
