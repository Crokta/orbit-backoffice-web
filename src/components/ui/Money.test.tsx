import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Money } from './Money'

describe('Money', () => {
  it('divides minor units at the last possible moment', () => {
    render(<Money minorUnits={425_000} currency="NGN" />)

    // Minor units all the way from the ledger to here. Every earlier conversion to a
    // float is a rounding error waiting to be reconciled.
    expect(screen.getByText(/4,250\.00/)).toBeInTheDocument()
  })

  it('keeps two decimal places on a round amount', () => {
    render(<Money minorUnits={500_000} currency="NGN" />)

    // A fare column where some rows show ".00" and others do not cannot be scanned.
    expect(screen.getByText(/5,000\.00/)).toBeInTheDocument()
  })

  it('renders a zero amount rather than nothing', () => {
    render(<Money minorUnits={0} currency="NGN" />)

    // Zero is a real amount — a fully refunded ride — and it must not look like a
    // missing value.
    expect(screen.getByText(/0\.00/)).toBeInTheDocument()
  })

  it('handles a negative amount, which a refund posting is', () => {
    render(<Money minorUnits={-125_050} currency="NGN" />)

    expect(screen.getByText(/1,250\.50/)).toBeInTheDocument()
  })

  it('uses tabular figures so a column of fares lines up', () => {
    const { container } = render(<Money minorUnits={100} currency="NGN" />)

    expect(container.firstElementChild).toHaveClass('tabular')
  })
})
