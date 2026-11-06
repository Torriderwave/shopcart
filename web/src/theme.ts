import {
  Card,
  Paper,
  Button,
  Badge,
  createTheme,
  rem,
  type MantineColorsTuple,
} from '@mantine/core';

// Violeta/índigo propio de la marca (de claro a oscuro).
const brand: MantineColorsTuple = [
  '#e9fbf5',
  '#c7f4e6',
  '#92e6cb',
  '#55d6ae',
  '#27c19a',
  '#12a784',
  '#0b8f70',
  '#097559',
  '#075f49',
  '#054a39',
];

export const theme = createTheme({
  colors: { brand },
  primaryColor: 'brand',
  primaryShade: 6,
  defaultRadius: 'md',
  fontFamily: "'Inter Variable', Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
  headings: {
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif",
    fontWeight: '800',
    sizes: {
      h1: { fontSize: rem(36), lineHeight: '1.15' },
      h2: { fontSize: rem(28), lineHeight: '1.2' },
      h3: { fontSize: rem(20), lineHeight: '1.3' },
    },
  },
  shadows: {
    xs: '0 1px 2px rgba(4, 32, 26, .06)',
    sm: '0 2px 8px rgba(4, 32, 26, .07)',
    md: '0 8px 24px rgba(4, 32, 26, .10)',
    lg: '0 16px 40px rgba(4, 32, 26, .14)',
  },
  components: {
    Card: Card.extend({ defaultProps: { radius: 'lg', shadow: 'xs' } }),
    Paper: Paper.extend({ defaultProps: { radius: 'lg' } }),
    Button: Button.extend({ defaultProps: { radius: 'md', fw: 600 } }),
    Badge: Badge.extend({ defaultProps: { fw: 700 } }),
  },
});
