import React, { cache } from 'react'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { SourceFile } from 'ts-morph'
import { getHighlighter, type Theme } from './highlighter'
import { project } from './project'
import { CodeView } from './CodeView'

export type BaseCodeProps = {
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

  /** Show or hide errors. */
  showErrors?: boolean

  /** Class name to be applied to the code block. */
  className?: string
}

export type CodeProps =
  | ({
      /** Code snippet to be highlighted. */
      value?: string
    } & BaseCodeProps)
  | ({
      /** Source code to be highlighted. */
      source?: string

      /** Specify the working directory for the [source]. */
      workingDirectory?: string
    } & BaseCodeProps)

const loadTypeDeclarations = cache(async () => {
  const typeDeclarations = JSON.parse(
    await readFile(`.next/static/mdxts/types.json`, 'utf8')
  )

  typeDeclarations.forEach(({ path, code }) => {
    project.createSourceFile(path, code, { overwrite: true })
  })
})

const languageMap = {
  shell: 'shellscript',
  bash: 'shellscript',
  mjs: 'javascript',
}
let filenameId = 0

/** Renders a code block with syntax highlighting. */
export async function Code({
  filename: filenameProp,
  language,
  lineNumbers,
  highlight,
  theme,
  className,
  showErrors,
  ...props
}: CodeProps) {
  let finalValue
  let finalLanguage = languageMap[language] ?? language
  let isJsxOnly = false

  if ('value' in props) {
    finalValue = props.value
  }

  if ('source' in props) {
    const sourcePath = join(props.workingDirectory ?? '', props.source ?? '')
    finalValue = await readFile(sourcePath, 'utf-8')
    finalLanguage = sourcePath.split('.').pop()
  }

  const filename =
    'source' in props
      ? props.source
      : filenameProp ?? `${filenameId++}.mdxts.${finalLanguage}`
  const highlighter = await getHighlighter({ theme })
  let sourceFile: SourceFile

  if (['js', 'jsx', 'ts', 'tsx'].includes(finalLanguage)) {
    await loadTypeDeclarations()

    sourceFile = project.createSourceFile(filename, finalValue, {
      overwrite: true,
    })

    const importCount = sourceFile.getImportDeclarations().length

    sourceFile.fixMissingImports()

    // If there were no imports, then this is a JSX-only source file.
    if (importCount === 0 && sourceFile.getImportDeclarations().length > 0) {
      isJsxOnly = true
    }

    sourceFile.formatText({ indentSize: 2 })
  }

  const tokens = highlighter(finalValue, finalLanguage, sourceFile, isJsxOnly)

  return (
    <CodeView
      tokens={tokens}
      lineNumbers={lineNumbers}
      sourceFile={sourceFile}
      filename={filename}
      highlighter={highlighter}
      highlight={highlight}
      language={finalLanguage}
      theme={theme}
      isJsxOnly={isJsxOnly}
      showErrors={showErrors}
      className={className}
    />
  )
}