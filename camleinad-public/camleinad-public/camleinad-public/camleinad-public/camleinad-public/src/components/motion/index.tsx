import type { HTMLAttributes, ReactNode } from 'react';

type StaticWrapperProps = HTMLAttributes<HTMLDivElement> & { children: ReactNode; delay?: number; staggerDelay?: number };

export function FadeUp({ children, delay: _delay, ...props }: StaticWrapperProps) {
  return <div {...props}>{children}</div>;
}

export function FadeLeft({ children, delay: _delay, ...props }: StaticWrapperProps) {
  return <div {...props}>{children}</div>;
}

export function RevealOnScroll({ children, delay: _delay, ...props }: StaticWrapperProps) {
  return <div {...props}>{children}</div>;
}

export function StaggerContainer({ children, staggerDelay: _staggerDelay, ...props }: StaticWrapperProps) {
  return <div {...props}>{children}</div>;
}

export function StaggerItem({ children, ...props }: StaticWrapperProps) {
  return <div {...props}>{children}</div>;
}

export function ScaleIn({ children, delay: _delay, ...props }: StaticWrapperProps) {
  return <div {...props}>{children}</div>;
}

export function PageTransition({ children }: { children: ReactNode }) {
  return <div>{children}</div>;
}

export function HoverCard({ children, ...props }: StaticWrapperProps) {
  return <div {...props}>{children}</div>;
}

export default { FadeUp, FadeLeft, RevealOnScroll, StaggerContainer, StaggerItem, ScaleIn, PageTransition, HoverCard };
