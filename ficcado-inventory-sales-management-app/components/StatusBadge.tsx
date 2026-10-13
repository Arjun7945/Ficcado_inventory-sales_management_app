import React from 'react';

export type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'neutral';

interface StatusBadgeProps {
  status?: string;
  variant?: BadgeVariant;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Normalizes any status string into one of the 4 strict badge color families defined in Newdesign.md Section 7.4.
 */
export function getBadgeVariant(status: string = ''): BadgeVariant {
  const normalized = status.toLowerCase().trim();

  // Green Family: Positive / Completed states
  if (
    [
      'in stock',
      'paid',
      'verified',
      'active',
      'approved',
      'completed',
      'success',
      'delivered',
      'resolved',
      'settled',
    ].includes(normalized) ||
    normalized.includes('saved') ||
    normalized.includes('profit')
  ) {
    return 'success';
  }

  // Gold Family: Pending / In-Progress / Warning states
  if (
    [
      'pending',
      'processing',
      'low stock',
      'draft',
      'warning',
      'in progress',
      'in_transit',
      'on hold',
      'partial',
      'under review',
      'unverified',
    ].includes(normalized) ||
    normalized.includes('pending')
  ) {
    return 'warning';
  }

  // Red Family: Failed / Blocked / Refunded / Out-of-Stock states
  if (
    [
      'out of stock',
      'failed',
      'refunded',
      'cancelled',
      'damaged',
      'rejected',
      'error',
      'defective',
      'unpaid',
      'returned',
      'overdue',
      'expired',
      'lost',
    ].includes(normalized) ||
    normalized.includes('refund') ||
    normalized.includes('cancel') ||
    normalized.includes('damage')
  ) {
    return 'error';
  }

  // Blue / Neutral Family: Informational / Neutral states
  return 'info';
}

export function StatusBadge({ status, variant, children, className = '' }: StatusBadgeProps) {
  const displayLabel = children || status || '';
  const effectiveVariant = variant || (status ? getBadgeVariant(status) : 'info');

  const variantClass = {
    success: 'badge-success',
    warning: 'badge-warning',
    error: 'badge-error',
    info: 'badge-info',
    neutral: 'badge-neutral',
  }[effectiveVariant];

  return (
    <span className={`badge ${variantClass} ${className}`}>
      {displayLabel}
    </span>
  );
}

export default StatusBadge;
