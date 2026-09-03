import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('never relies on colour alone', () => {
    render(<StatusPill status="in-trip" />)

    // Roughly one man in twelve cannot reliably tell the green from the amber. Every
    // pill carries its label for that reason.
    expect(screen.getByText('In trip')).toBeInTheDocument()
  })

  it('spells out arrears rather than showing a symbol', () => {
    render(<StatusPill status="arrears" />)

    // "In arrears" means the rider travelled and the money did not follow. It is not
    // an error state, and a red exclamation mark would read as one.
    expect(screen.getByText('In arrears')).toBeInTheDocument()
  })
})
