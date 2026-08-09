type IsolatedSibling = {
  element: HTMLElement
  inert: boolean
  ariaHidden: string | null
}

const ISOLATION_EXEMPT_ATTRIBUTE = 'data-modal-isolation-exempt'

/**
 * Keep a portalled modal as the only interactive body child while it is open.
 * Explicitly exempted portal layers, such as toast live regions, stay available
 * so modal feedback is not removed from the accessibility tree.
 * Every previous state is restored so nested or pre-isolated application roots
 * remain correct after the modal closes.
 */
export function isolateBodySiblings(modalRoot: HTMLElement) {
  const siblings: IsolatedSibling[] = Array.from(document.body.children)
    .filter(
      (element): element is HTMLElement =>
        element instanceof HTMLElement &&
        element !== modalRoot &&
        !element.hasAttribute(ISOLATION_EXEMPT_ATTRIBUTE),
    )
    .map((element) => ({
      element,
      inert: element.inert,
      ariaHidden: element.getAttribute('aria-hidden'),
    }))

  for (const { element } of siblings) {
    element.inert = true
    element.setAttribute('aria-hidden', 'true')
  }

  return () => {
    for (const { element, inert, ariaHidden } of siblings) {
      element.inert = inert
      if (ariaHidden === null) {
        element.removeAttribute('aria-hidden')
      } else {
        element.setAttribute('aria-hidden', ariaHidden)
      }
    }
  }
}
