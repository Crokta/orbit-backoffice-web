import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { Button } from './Button'

describe('Button', () => {
  it('cannot be clicked twice while it is working', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(
      <Button loading onClick={onClick}>
        Refund
      </Button>,
    )

    await user.click(screen.getByRole('button'))

    // A loading button is disabled in the DOM as well as visually. Otherwise a
    // double-click on a refund screen is a real refund twice.
    expect(onClick).not.toHaveBeenCalled()
  })

  it('announces that it is busy rather than that it is forbidden', () => {
    render(<Button loading>Save</Button>)

    // Different things to a screen reader: a disabled button is one you may not press,
    // a busy one is a button already working.
    expect(screen.getByRole('button')).toHaveAttribute('aria-busy', 'true')
  })

  it('still fires when it is idle', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()

    render(<Button onClick={onClick}>Save</Button>)
    await user.click(screen.getByRole('button'))

    expect(onClick).toHaveBeenCalledOnce()
  })

  it('lets a caller override a conflicting class', () => {
    render(<Button className="h-16">Tall</Button>)

    // twMerge resolves the conflict predictably. Plain concatenation would leave both
    // heights in the DOM and let emission order decide.
    expect(screen.getByRole('button').className).toContain('h-16')
    expect(screen.getByRole('button').className).not.toContain('h-10')
  })
})
