// Framer Motion variants
export const modalOverlayVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};
export const modalContentVariants = {
  hidden: { opacity: 0, scale: 0.98 },
  visible: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.98 },
};
export const modalTransition = { duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] };
export const overlayTransition = { duration: 0.18 };
