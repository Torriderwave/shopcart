import { AnimatePresence, motion } from 'motion/react';
import { useLocation, useOutlet } from 'react-router-dom';

const SUAVE = [0.22, 1, 0.36, 1] as const;

// `dir` = 0: la vista sube y se desvanece; ±1: se desliza hacia el lado del destino.
const variantes = {
  entra: (dir: number) => ({ opacity: 0, x: dir * 56, y: dir ? 0 : 20 }),
  visible: { opacity: 1, x: 0, y: 0, transition: { duration: 0.4, ease: SUAVE } },
  sale: (dir: number) => ({
    opacity: 0,
    x: dir * -28,
    y: dir ? 0 : -10,
    transition: { duration: 0.16 },
  }),
};

/**
 * Anima el cambio entre rutas hijas.
 * - `clave` agrupa rutas que no deben remontarse (login/registro comparten el panel de marca).
 * - `dir` fija el sentido del deslizamiento horizontal.
 * - `salida` anima también la vista que se va. Solo es seguro cuando el contenido NO contiene
 *   guardas de acceso (RequireRole/GuestOnly): mientras sale, ese árbol sigue montado y vería la
 *   ruta nueva (p. ej. un GuestOnly saliente redirigiría al inicio y perdería el destino pedido).
 */
export function PageTransition({
  clave,
  dir = 0,
  salida = false,
}: {
  clave?: string;
  dir?: number;
  salida?: boolean;
}) {
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const vista = (
    <motion.div
      key={clave ?? pathname}
      custom={dir}
      variants={variantes}
      initial="entra"
      animate="visible"
      exit={salida ? 'sale' : undefined}
    >
      {outlet}
    </motion.div>
  );
  if (!salida) return vista;
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      {vista}
    </AnimatePresence>
  );
}
