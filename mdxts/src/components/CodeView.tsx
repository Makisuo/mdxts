import React, { Fragment } from 'react'
import type { SourceFile } from 'ts-morph'
import { Node, SyntaxKind } from 'ts-morph'
import { type Theme } from './highlighter'
import { Symbol } from './Symbol'
import { QuickInfo } from './QuickInfo'
import { RegisterSourceFile } from './RegisterSourceFile'
import { Pre } from './Pre'
import { CodeToolbar } from './CodeToolbar'

export type CodeProps = {
  /** Code snippet to be highlighted. */
  value?: string

  /** Name of the file. */
  filename?: string

  /** Language of the code snippet. */
  language?: string

  /** Show or hide line numbers. */
  lineNumbers?: boolean

  /** Lines to highlight. */
  highlight?: string

  /** VS Code-based theme for highlighting. */
  theme?: Theme

  /** Padding to apply to the code block. */
  padding?: string

  /** Horizontal padding to apply to the code block. */
  paddingHorizontal?: string

  /** Vertical padding to apply to the code block. */
  paddingVertical?: string

  /** Whether or not the code is presented inline or as a block-level element. */
  inline?: boolean

  /** Show or hide errors. */
  showErrors?: boolean

  /** Class name to be applied to the code block. */
  className?: string
}

const lineHeight = 20

/** Renders a code block with syntax highlighting. */
export function CodeView({
  row,
  tokens,
  lineNumbers,
  sourceFile,
  filename,
  highlight,
  highlighter,
  language,
  theme,
  showErrors,
  className,
  isJsxOnly,
  isNestedInEditor,
  shouldRenderFilename,
  rootDirectory,
  baseDirectory,
  edit,
  value,
  padding = '1rem',
  paddingHorizontal = padding,
  paddingVertical = padding,
  inline,
}: CodeProps & {
  row?: [number, number]
  tokens: any
  sourceFile?: SourceFile
  highlighter: any
  isJsxOnly?: boolean
  isNestedInEditor?: boolean
  shouldRenderFilename?: boolean
  rootDirectory?: string
  baseDirectory?: string
  edit?: any
}) {
  const editorForeground = theme.colors['editor.foreground'].toLowerCase()
  const symbolBounds = sourceFile
    ? getSymbolBounds(sourceFile, isJsxOnly, lineHeight)
    : []
  const shouldHighlightLine = calculateLinesToHighlight(highlight)
  const diagnostics = sourceFile?.getPreEmitDiagnostics()
  const Container = isNestedInEditor
    ? React.Fragment
    : (props) => (
        <div
          style={{
            display: inline ? 'inline-grid' : 'grid',
            gridTemplateColumns: 'auto 1fr',
            position: 'relative',
            margin: inline ? undefined : '0 0 1.6rem',
            borderRadius: 5,
            border: `1px solid ${theme.colors['contrastBorder']}`,
            backgroundColor: theme.colors['editor.background'],
            color: theme.colors['editor.foreground'],
          }}
          {...props}
        />
      )

  return (
    <Container>
      <RegisterSourceFile
        filename={filename}
        source={sourceFile?.getFullText()}
      />

      {shouldRenderFilename ? (
        <CodeToolbar filename={filename} value={value} />
      ) : null}

      {lineNumbers ? (
        <div
          className={className}
          style={{
            gridColumn: 1,
            gridRow: filename ? 2 : 1,
            width: '6ch',
            paddingTop: paddingVertical,
            paddingBottom: paddingVertical,
            fontSize: 14,
            lineHeight: '20px',
            paddingRight: '2ch',
            textAlign: 'right',
            userSelect: 'none',
            whiteSpace: 'pre',
            color: theme.colors['editorLineNumber.foreground'],
          }}
        >
          {tokens.map((_, lineIndex) => {
            const shouldHighlight = shouldHighlightLine(lineIndex)
            const isActive = row && row[0] <= lineIndex && lineIndex <= row[1]
            const Wrapper = ({ children }: { children: React.ReactNode }) =>
              shouldHighlight || isActive ? (
                <div
                  style={{
                    color: theme.colors['editorLineNumber.activeForeground'],
                  }}
                >
                  {children}
                </div>
              ) : (
                <Fragment>
                  {children}
                  {'\n'}
                </Fragment>
              )
            return <Wrapper key={lineIndex}>{lineIndex + 1}</Wrapper>
          })}
        </div>
      ) : null}

      <Pre
        isNestedInEditor={isNestedInEditor}
        className={className}
        style={{
          gridRow: filename ? 2 : 1,
          paddingTop: paddingVertical,
          paddingBottom: paddingVertical,
          paddingLeft: paddingHorizontal,
          paddingRight: paddingHorizontal,
        }}
      >
        {diagnostics
          ? diagnostics.map((diagnostic) => {
              const start = diagnostic.getStart()
              const end = start + diagnostic.getLength()
              const { line, column } = sourceFile.getLineAndColumnAtPos(start)
              const yOffset = isJsxOnly ? 2 : 1
              const top = (line - yOffset) * lineHeight
              const height = lineHeight
              const width = end - start
              return (
                <div
                  key={start}
                  style={{
                    position: 'absolute',
                    top: `calc(${top}px + ${paddingVertical})`,
                    left: `calc(${column - 1} * 1ch + ${paddingHorizontal})`,
                    width: `calc(${width} * 1ch)`,
                    height,
                    backgroundImage: `url("data:image/svg+xml,%3Csvg%20xmlns%3D'http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg'%20viewBox%3D'0%200%206%203'%20enable-background%3D'new%200%200%206%203'%20height%3D'3'%20width%3D'6'%3E%3Cg%20fill%3D'%23f14c4c'%3E%3Cpolygon%20points%3D'5.5%2C0%202.5%2C3%201.1%2C3%204.1%2C0'%2F%3E%3Cpolygon%20points%3D'4%2C0%206%2C2%206%2C0.6%205.4%2C0'%2F%3E%3Cpolygon%20points%3D'0%2C2%201%2C3%202.4%2C3%200%2C0.6'%2F%3E%3C%2Fg%3E%3C%2Fsvg%3E")`,
                    backgroundRepeat: 'repeat-x',
                    backgroundPosition: 'bottom left',
                    pointerEvents: 'none',
                  }}
                />
              )
            })
          : null}

        {symbolBounds.map((bounds, index) => {
          const filteredDiagnostics = diagnostics.filter((diagnostic) => {
            const start = diagnostic.getStart()
            const end = start + diagnostic.getLength()
            return start <= bounds.start && bounds.start <= end
          })
          const isQuickInfoOpen = showErrors && filteredDiagnostics.length > 0
          return (
            <Symbol
              key={index}
              isQuickInfoOpen={isQuickInfoOpen}
              style={{
                top: `calc(${bounds.top}px + ${paddingVertical})`,
                left: `calc(${bounds.left} * 1ch + ${paddingHorizontal})`,
                width: `calc(${bounds.width} * 1ch)`,
                height: bounds.height,
              }}
            >
              <QuickInfo
                bounds={bounds}
                filename={filename}
                highlighter={highlighter}
                language={language}
                theme={theme}
                diagnostics={filteredDiagnostics}
                edit={edit}
                isQuickInfoOpen={isQuickInfoOpen}
                rootDirectory={rootDirectory}
                baseDirectory={baseDirectory}
              />
            </Symbol>
          )
        })}

        {tokens.map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {line.map((token, tokenIndex) => {
              if (
                token.color.toLowerCase() === editorForeground ||
                token.content.trim() === ''
              ) {
                return token.content
              }

              return (
                <span
                  key={tokenIndex}
                  style={{
                    ...token.fontStyle,
                    color: token.color,
                    textDecoration: token.hasError
                      ? 'red wavy underline'
                      : 'none',
                  }}
                >
                  {token.content}
                </span>
              )
            })}
            {lineIndex === tokens.length - 1 ? null : '\n'}
          </Fragment>
        ))}

        {highlight
          ? highlight
              .split(',')
              .map((range) => {
                const [start, end] = range.split('-')
                const parsedStart = parseInt(start, 10)
                const parsedEnd = end ? parseInt(end, 10) : parsedStart
                return {
                  start: parsedStart,
                  end: parsedEnd,
                }
              })
              .map((range, index) => {
                const start = range.start - 1
                const end = range.end ? range.end - 1 : start
                const top = start * lineHeight
                const height = (end - start + 1) * lineHeight

                return (
                  <div
                    key={index}
                    style={{
                      position: 'absolute',
                      top: `calc(${top}px + ${paddingVertical})`,
                      left: 0,
                      width: '100%',
                      height,
                      backgroundColor: '#87add726',
                      pointerEvents: 'none',
                    }}
                  />
                )
              })
          : null}
      </Pre>
    </Container>
  )
}

/** Calculate which lines to highlight based on the range meta string added by the rehype plugin. */
function calculateLinesToHighlight(meta) {
  if (meta === undefined || meta === '') {
    return () => false
  }
  const lineNumbers = meta
    .split(',')
    .map((value) => value.split('-').map((y) => parseInt(y, 10)))

  return (index) => {
    const lineNumber = index + 1
    const inRange = lineNumbers.some(([start, end]) =>
      end ? lineNumber >= start && lineNumber <= end : lineNumber === start
    )
    return inRange
  }
}

/* Get the bounding rectangle of all module import specifiers and identifiers in a source file. */
function getSymbolBounds(
  sourceFile: SourceFile,
  isJsxOnly: boolean,
  lineHeight: number
) {
  const importSpecifiers = isJsxOnly
    ? []
    : sourceFile
        .getImportDeclarations()
        .map((importDeclaration) => importDeclaration.getModuleSpecifier())
  const identifiers = sourceFile.getDescendantsOfKind(SyntaxKind.Identifier)
  const importCount = sourceFile.getImportDeclarations().length
  const allNodes = [...importSpecifiers, ...identifiers]
  const bounds = allNodes
    .filter((node) => {
      const parent = node.getParent()
      const isJsxOnlyImport = isJsxOnly
        ? parent?.getKind() === SyntaxKind.ImportSpecifier ||
          parent?.getKind() === SyntaxKind.ImportClause
        : false
      return (
        !Node.isJSDocTag(parent) && !Node.isJSDoc(parent) && !isJsxOnlyImport
      )
    })
    .map((node) => {
      const start = node.getStart()
      const { line, column } = sourceFile.getLineAndColumnAtPos(start)
      const yOffset = isJsxOnly ? importCount + 2 : 1
      return {
        start,
        top: (line - yOffset) * lineHeight,
        left: column - 1,
        width: node.getWidth(),
        height: lineHeight,
      }
    })

  return bounds
}
