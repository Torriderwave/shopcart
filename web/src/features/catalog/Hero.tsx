import { Box, Group, Stack, Text } from '@mantine/core';
import { IconArrowRight, IconSparkles } from '@tabler/icons-react';
import Aurora from '../../components/reactbits/Aurora';
import BlurText from '../../components/reactbits/BlurText';
import GradientText from '../../components/reactbits/GradientText';
import Magnet from '../../components/reactbits/Magnet';
import ScrollVelocity from '../../components/reactbits/ScrollVelocity';
import ShinyText from '../../components/reactbits/ShinyText';
import StarBorder from '../../components/reactbits/StarBorder';

const FRASES = [
  'Envío gratis desde Q200',
  'IVA incluido',
  'Devoluciones con reembolso exacto',
  'Cupones de bienvenida',
  'Stock reservado al pagar',
];

// Fotos del catálogo de demostración que decoran el héroe.
const COLLAGE = ['29', '09', '33', '15'];

export function Hero({ onVer }: { onVer: () => void }) {
  return (
    <>
      <Box className="hero-dark" mb="md">
        <div className="hero-aurora" aria-hidden>
          <Aurora
            colorStops={['#10b981', '#bef264', '#f59e0b']}
            amplitude={1.15}
            blend={0.65}
            speed={0.7}
            style={{ width: '100%', height: '100%' }}
          />
        </div>
        <Stack gap="lg" className="hero-content">
          <div className="hero-pill">
            <IconSparkles size={15} />
            <ShinyText text="Nueva colección 2026" speed={3} color="#bef264" shineColor="#ffffff" />
          </div>
          <BlurText
            text="Tu estilo, sin complicaciones."
            animateBy="words"
            delay={120}
            className="hero-title"
          />
          <Text className="hero-sub">
            Ropa, calzado, tecnología y hogar en un solo lugar.{' '}
            <GradientText colors={['#6ee7b7', '#d9f99d', '#fcd34d']} animationSpeed={6}>
              Compra rápido, paga seguro.
            </GradientText>
          </Text>
          <Group gap="md">
            <Magnet padding={60} magnetStrength={4}>
              <StarBorder
                as="button"
                type="button"
                color="#bef264"
                radius={999}
                onClick={onVer}
                className="hero-cta"
              >
                <span>Explorar productos</span>
                <IconArrowRight size={18} />
              </StarBorder>
            </Magnet>
          </Group>
        </Stack>
        <div className="hero-collage" aria-hidden>
          {COLLAGE.map((f, i) => (
            <img
              key={f}
              src={`/productos/${f}.jpg`}
              alt=""
              className={`hero-foto hero-foto-${i + 1}`}
            />
          ))}
        </div>
      </Box>
      <div className="marquesina" aria-hidden>
        <ScrollVelocity texts={[FRASES.join('   ✦   ')]} velocity={45} />
      </div>
    </>
  );
}
