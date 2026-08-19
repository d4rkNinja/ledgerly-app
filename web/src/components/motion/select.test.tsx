import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MotionConfig } from 'motion/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './select'

class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('Select option lists', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    )
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('keeps a long option list inside a scrollable viewport', async () => {
    const user = userEvent.setup()
    render(
      <MotionConfig reducedMotion="always">
        <Select value="option-1">
          <SelectTrigger aria-label="Choose an option">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 18 }, (_, index) => (
              <SelectItem key={index} value={`option-${index + 1}`}>
                Option {index + 1}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </MotionConfig>,
    )

    await user.click(screen.getByRole('button', { name: 'option-1' }))

    const listbox = screen.getByRole('listbox')
    expect(listbox).not.toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('option', { name: 'Option 18' })).toBeInTheDocument()
  })

  it('groups option rows in a marker-free semantic list', async () => {
    const user = userEvent.setup()
    render(
      <MotionConfig reducedMotion="always">
        <Select value="salary">
          <SelectTrigger aria-label="Choose income category">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="salary">Salary</SelectItem>
            <SelectItem value="freelance">Freelance</SelectItem>
          </SelectContent>
        </Select>
      </MotionConfig>,
    )

    await user.click(
      screen.getByRole('button', { name: 'Salary' }),
    )

    expect(screen.getAllByRole('option')).toHaveLength(2)
  })

  it('constrains an upward list to the visible scroll container', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('innerHeight', 400)
    const viewportListeners = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }
    vi.stubGlobal('visualViewport', {
      height: 400,
      offsetTop: 0,
      ...viewportListeners,
    })
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function getRect(this: HTMLElement) {
        if (this.dataset.selectBoundary === 'true') {
          return DOMRect.fromRect({ x: 0, y: 100, width: 320, height: 300 })
        }
        if (this.tagName === 'BUTTON') {
          return DOMRect.fromRect({ x: 16, y: 350, width: 288, height: 44 })
        }
        return DOMRect.fromRect()
      },
    )
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(160)

    render(
      <MotionConfig reducedMotion="always">
        <div
          data-select-boundary="true"
          style={{ height: 300, overflowY: 'auto' }}
        >
          <Select value="option-1">
            <SelectTrigger aria-label="Choose account type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 10 }, (_, index) => (
                <SelectItem key={index} value={`option-${index + 1}`}>
                  Option {index + 1}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </MotionConfig>,
    )

    await user.click(screen.getByRole('button', { name: 'option-1' }))

    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveClass('bottom-full')
  })

  it('opens with usable content when Android layout is not measured yet', async () => {
    const user = userEvent.setup()
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect(),
    )
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(160)

    render(
      <Select defaultValue="one">
        <SelectTrigger aria-label="Delayed layout select">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="one">One</SelectItem>
          <SelectItem value="two">Two</SelectItem>
        </SelectContent>
      </Select>,
    )

    await user.click(screen.getByRole('button', { name: 'One' }))

    const listbox = screen.getByRole('listbox')
    expect(listbox).not.toHaveAttribute('aria-hidden', 'true')
    await user.click(screen.getByRole('option', { name: 'Two' }))
    expect(screen.getByRole('button', { name: 'Two' })).toHaveTextContent('Two')
  })
})
