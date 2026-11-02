import { WidgetType } from '@codemirror/view'
import { renderMath } from './mathRender'

// 줄 안에 들어가는 위젯: 인라인 수식, 수식 입력 중 미리보기, 각주 표시.

export class MathInline extends WidgetType {
  constructor(readonly src: string, readonly display: boolean) {
    super()
  }
  eq(o: MathInline) {
    return o.src === this.src && o.display === this.display
  }
  toDOM() {
    const el = document.createElement('span')
    el.className = 'cm-math-inline'
    renderMath(el, this.src, this.display)
    return el
  }
}

// 수식을 입력하는 동안 커서 아래에 뜨는 미리보기. 오류가 있으면 오류 메시지를 보여 준다.
export class MathBubble extends WidgetType {
  constructor(readonly src: string, readonly display: boolean) {
    super()
  }
  eq(o: MathBubble) {
    return o.src === this.src && o.display === this.display
  }
  toDOM() {
    const anchor = document.createElement('span')
    anchor.className = 'cm-math-anchor'
    const bubble = document.createElement('span')
    bubble.className = 'cm-math-bubble'
    const body = document.createElement('span')
    const err = renderMath(body, this.src, this.display)
    if (err) {
      bubble.classList.add('error')
      bubble.textContent = err
    } else bubble.append(body)
    anchor.append(bubble)
    return anchor
  }
  ignoreEvent() {
    return true
  }
}

// 각주 참조 [^1]: 위첨자로 보이고, 마우스를 올리면 정의 내용이 말풍선으로 뜬다(CSS의 data-tip).
export class FnRef extends WidgetType {
  constructor(readonly label: string, readonly tip: string | null) {
    super()
  }
  eq(o: FnRef) {
    return o.label === this.label && o.tip === this.tip
  }
  toDOM() {
    const el = document.createElement('sup')
    el.className = 'cm-fnref' + (this.tip === null ? ' missing' : '')
    el.textContent = this.label
    el.dataset.tip = this.tip ?? '각주 정의가 없습니다'
    return el
  }
}
