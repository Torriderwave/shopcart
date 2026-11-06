import { Box, CopyButton, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import {
  IconArrowBackUp,
  IconCheck,
  IconCopy,
  IconShieldCheck,
  IconTruckDelivery,
} from '@tabler/icons-react';
import AnimatedContent from '../../components/reactbits/AnimatedContent';
import GradientText from '../../components/reactbits/GradientText';
import SpotlightCard from '../../components/reactbits/SpotlightCard';

const CUPON = 'BIENVENIDA10';

/** Banner de cupón de bienvenida con botón de copiar. */
export function PromoCupon() {
  return (
    <AnimatedContent distance={40} duration={0.8} blur={6} threshold={0.2}>
      <Box className="promo">
        <Stack gap={6} style={{ position: 'relative', zIndex: 1 }}>
          <Text className="promo-kicker">Tu primera compra</Text>
          <Title order={2} c="white" fz={{ base: 26, sm: 36 }} lh={1.1}>
            <GradientText colors={['#bef264', '#6ee7b7', '#fcd34d']} animationSpeed={5}>
              10 % de descuento
            </GradientText>{' '}
            para empezar
          </Title>
          <Text c="white" opacity={0.8} maw={460}>
            Usa el cupón al pagar y estrena tu cuenta con ventaja. Válido en todo el carrito.
          </Text>
        </Stack>
        <CopyButton value={CUPON} timeout={2200}>
          {({ copied, copy }) => (
            <button
              type="button"
              className="cupon-ticket"
              onClick={copy}
              aria-label={`Copiar cupón ${CUPON}`}
            >
              <span className="cupon-etq">Código</span>
              <span className="cupon-cod">{CUPON}</span>
              <span className="cupon-acc">
                {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                {copied ? '¡Copiado!' : 'Copiar'}
              </span>
            </button>
          )}
        </CopyButton>
      </Box>
    </AnimatedContent>
  );
}

const BENEFICIOS = [
  {
    icon: IconTruckDelivery,
    t: 'Envío gratis desde Q200',
    d: 'Armas tu pedido y el envío corre por nuestra cuenta cuando pasas de Q200.',
  },
  {
    icon: IconArrowBackUp,
    t: 'Devoluciones sin sorpresas',
    d: 'Reembolso proporcional al centavo, incluyendo cualquier descuento aplicado.',
  },
  {
    icon: IconShieldCheck,
    t: 'Tu stock, reservado',
    d: 'Al iniciar el pago reservamos tus productos para que nadie te los gane.',
  },
];

export function Beneficios() {
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="lg" mt={56}>
      {BENEFICIOS.map(({ icon: I, t, d }, i) => (
        <AnimatedContent
          key={t}
          distance={36}
          duration={0.7}
          delay={i * 0.1}
          blur={6}
          threshold={0.2}
        >
          <SpotlightCard
            theme="light"
            spotlightColor="rgba(18, 167, 132, 0.22)"
            className="beneficio"
          >
            <Group gap="md" align="flex-start" wrap="nowrap">
              <div className="beneficio-icono">
                <I size={26} stroke={1.6} />
              </div>
              <div>
                <Text fw={800} fz="md">
                  {t}
                </Text>
                <Text size="sm" c="dimmed" mt={4}>
                  {d}
                </Text>
              </div>
            </Group>
          </SpotlightCard>
        </AnimatedContent>
      ))}
    </SimpleGrid>
  );
}

export function HomeSections() {
  return (
    <>
      <Box mt={56}>
        <PromoCupon />
      </Box>
      <Beneficios />
    </>
  );
}
