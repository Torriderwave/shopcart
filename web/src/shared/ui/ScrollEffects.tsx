import { motion, useScroll, useSpring } from 'motion/react';
import { ActionIcon, Affix, Transition } from '@mantine/core';
import { useWindowScroll } from '@mantine/hooks';
import { IconArrowUp } from '@tabler/icons-react';

/** Barra de progreso de lectura (arriba) y botón «volver arriba» (abajo a la derecha). */
export function ScrollEffects() {
  const { scrollYProgress } = useScroll();
  const escala = useSpring(scrollYProgress, { stiffness: 140, damping: 24, mass: 0.4 });
  const [scroll, scrollTo] = useWindowScroll();
  return (
    <>
      <motion.div className="scroll-progress" style={{ scaleX: escala }} aria-hidden />
      <Affix position={{ bottom: 24, right: 24 }}>
        <Transition transition="slide-up" mounted={scroll.y > 700}>
          {(styles) => (
            <ActionIcon
              style={styles}
              size={46}
              radius="xl"
              variant="filled"
              aria-label="Volver arriba"
              onClick={() => scrollTo({ y: 0 })}
              className="to-top"
            >
              <IconArrowUp size={22} />
            </ActionIcon>
          )}
        </Transition>
      </Affix>
    </>
  );
}
