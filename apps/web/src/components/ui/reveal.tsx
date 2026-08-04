'use client';

import { motion, type HTMLMotionProps } from 'framer-motion';
import type { PropsWithChildren } from 'react';

export function Reveal({ children, delay = 0, className, ...props }: PropsWithChildren<HTMLMotionProps<'div'>> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function ScaleIn({ children, delay = 0, className, ...props }: PropsWithChildren<HTMLMotionProps<'div'>> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1], delay }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function HoverLift({ children, className, ...props }: PropsWithChildren<HTMLMotionProps<'div'>>) {
  return (
    <motion.div whileHover={{ y: -6, scale: 1.01 }} transition={{ type: 'spring', stiffness: 280, damping: 22 }} className={className} {...props}>
      {children}
    </motion.div>
  );
}
