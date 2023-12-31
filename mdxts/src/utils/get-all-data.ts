import parseTitle from 'title'
import { join, resolve, sep } from 'node:path'
import { readPackageUpSync } from 'read-package-up'
import type { Project, SourceFile } from 'ts-morph'
import { getSymbolDescription, resolveExpression } from '@tsxmod/utils'

import { getSourcePath } from '../utils/get-source-path'
import { findCommonRootPath } from './find-common-root-path'
import { filePathToPathname } from './file-path-to-pathname'
import { getExamplesFromSourceFile } from './get-examples'
import { getExportedSourceFiles } from './get-exported-source-files'
import { getExportedTypes } from './get-exported-types'
import { getMainExportDeclaration } from './get-main-export-declaration'
import { getNameFromDeclaration } from './get-name-from-declaration'

export type Pathname = string

export type ModuleImport = Promise<Record<string, any>>

export type AllModules = Record<Pathname, ModuleImport>

export type ModuleData = {
  title: string
  label?: string
  description?: string
  order?: number
  mdxPath?: string
  tsPath?: string
  pathname: string
  sourcePath: string
  isMainExport?: boolean
  isServerOnly?: boolean
  exportedTypes: (Omit<
    ReturnType<typeof getExportedTypes>[number],
    'filePath'
  > & {
    pathname: string
    sourcePath: string
    isMainExport: boolean
  })[]
  examples: ReturnType<typeof getExamplesFromSourceFile>
}

export function getAllData({
  allModules,
  globPattern,
  project,
  baseDirectory,
  basePathname = '',
}: {
  /** A map of all MDX modules keyed by their pathname. */
  allModules: AllModules

  /** The glob pattern used to calculate `allModules`. */
  globPattern: string

  /** The ts-morph project to use for parsing source files. */
  project: Project

  /** The base directory to use when calculating source paths. */
  baseDirectory?: string

  /** The base path to use when calculating navigation paths. */
  basePathname?: string
}) {
  const typeScriptSourceFiles = /ts(x)?/.test(globPattern)
    ? project.addSourceFilesAtPaths(globPattern)
    : null
  const allPaths = [
    ...Object.keys(allModules),
    ...(typeScriptSourceFiles?.map((file) => file.getFilePath()) ?? []),
  ]
  const commonRootPath = findCommonRootPath(allPaths)
  const packageJson = readPackageUpSync({
    cwd: commonRootPath,
  })?.packageJson
  const hasMainExport = packageJson
    ? packageJson.exports
      ? Boolean((packageJson.exports as Record<string, any>)['.'])
      : false
    : false
  const packageName = hasMainExport ? packageJson!.name : undefined
  const entrySourceFiles = project.addSourceFilesAtPaths(
    packageJson?.exports
      ? /** If package.json exports found use that for calculating public paths. */
        Object.keys(packageJson.exports).map((key) =>
          join(resolve(commonRootPath, key), 'index.(ts|tsx)')
        )
      : /** Otherwise default to a root index file. */
        resolve(commonRootPath, '**/index.(ts|tsx)')
  )
  const exportedSourceFiles = getExportedSourceFiles(entrySourceFiles)
  const allPublicPaths = entrySourceFiles
    .concat(exportedSourceFiles)
    .map((sourceFile) => sourceFile.getFilePath() as string)
    .concat(Object.keys(allModules))
  const allData: Record<Pathname, ModuleData> = {}

  allPublicPaths.forEach((path) => {
    const type =
      path.endsWith('.ts') || path.endsWith('.tsx')
        ? 'ts'
        : path.endsWith('.md') || path.endsWith('.mdx')
          ? 'md'
          : null
    const pathnameKey = filePathToPathname(
      path,
      baseDirectory,
      basePathname,
      packageName
    )
    const pathname =
      basePathname === pathnameKey
        ? join(sep, basePathname)
        : join(sep, basePathname, pathnameKey)
    const previouseData = allData[pathnameKey]
    const sourceFile = project.addSourceFileAtPath(path)
    const sourceFileTitle = getSourceFileTitle(sourceFile)
    const order = getSourceFileSortOrder(sourceFile)
    const sourcePath = getSourcePath(path)
    const metadata = getMetadata(sourceFile)
    let title =
      type === 'md'
        ? findFirstHeading(sourceFile.getText()) || sourceFileTitle
        : sourceFileTitle
    let label
    let description

    if (metadata?.title) {
      title = metadata.title
    }

    if (metadata?.label) {
      label = metadata.label
    } else {
      label = title
    }

    if (metadata?.description) {
      description = metadata.description
    }

    /** Handle TypeScript source files */
    if (type === 'ts') {
      const exportedTypes = getExportedTypes(sourceFile).map(
        ({ filePath, ...fileExport }) => {
          const pathname = filePathToPathname(
            filePath,
            baseDirectory,
            basePathname,
            packageName
          )
          return {
            ...fileExport,
            pathname:
              basePathname === pathname
                ? join(sep, basePathname)
                : join(sep, basePathname, pathname),
            sourcePath: getSourcePath(filePath),
            isMainExport: filePath === path,
          }
        }
      )
      const examples = getExamplesFromSourceFile(sourceFile, allModules)
      const isMainExport = pathnameKey === packageName
      const isServerOnly = sourceFile
        .getImportDeclarations()
        .some((importDeclaration) => {
          const moduleSpecifier = importDeclaration.getModuleSpecifierValue()
          return moduleSpecifier === 'server-only'
        })
      const mainExportDeclaration = getMainExportDeclaration(sourceFile)
      const mainExportDeclarationSymbol = mainExportDeclaration?.getSymbol()

      if (mainExportDeclaration) {
        const declarationName = getNameFromDeclaration(mainExportDeclaration)
        if (declarationName) {
          title = declarationName
        }
      }

      if (mainExportDeclarationSymbol) {
        const symbolDescription = getSymbolDescription(
          mainExportDeclarationSymbol
        )
        if (symbolDescription) {
          description = symbolDescription
        }
      }

      allData[pathnameKey] = {
        ...previouseData,
        tsPath: path,
        exportedTypes,
        examples,
        title,
        label,
        description,
        isMainExport,
        isServerOnly,
        pathname,
        sourcePath,
      }
    }

    /** Handle MDX content */
    if (type === 'md') {
      allData[pathnameKey] = {
        ...previouseData,
        mdxPath: path,
        exportedTypes: previouseData?.exportedTypes || [],
        examples: previouseData?.examples || [],
        description: previouseData?.description || description,
        title,
        label,
        order,
        pathname,
        sourcePath,
      }
    }
  })

  return Object.fromEntries(
    Object.entries(allData).sort((a, b) => {
      // Give the main export the highest priority
      if (a[1].isMainExport) {
        return -1
      }
      if (b[1].isMainExport) {
        return 1
      }

      // Sort by order if available
      if (a[1].order && b[1].order) {
        return a[1].order - b[1].order
      }
      if (a[1].order) {
        return -1
      }
      if (b[1].order) {
        return 1
      }

      // Fallback to alphabetical order
      return a[0].localeCompare(b[0])
    })
  )
}

/** Returns the sorting order of a filename, taking into account directory nesting. */
function getSourceFileSortOrder(sourceFile: SourceFile) {
  const fileOrderMatch = sourceFile.getBaseNameWithoutExtension().match(/^\d+/)
  let currentDirectory = sourceFile.getDirectory()
  let parts: number[] = []

  if (fileOrderMatch) {
    parts.push(parseInt(fileOrderMatch[0], 10))
  }

  while (currentDirectory) {
    const directoryName = currentDirectory.getBaseName()
    const directoryOrderMatch = directoryName.match(/^\d+/)

    if (directoryOrderMatch) {
      parts.unshift(parseInt(directoryOrderMatch[0], 10))
    } else {
      break
    }

    const parentDirectory = currentDirectory.getParent()
    if (parentDirectory) {
      currentDirectory = parentDirectory
    } else {
      break
    }
  }

  return parts.length > 0 ? parseFloat(parts.join('.')) : -1
}

/** Returns the title of a source file based on its filename. */
function getSourceFileTitle(sourceFile: SourceFile) {
  const filename = sourceFile.getBaseNameWithoutExtension()
  const title = /(readme|index)$/i.test(filename)
    ? parseTitle(sourceFile.getDirectory().getBaseName())
    : /^[A-Z][a-zA-Z0-9]*$/.test(filename) // don't parse if PascalCase
      ? filename
      : parseTitle(filename)
  return title.replace(/-/g, ' ') // replace dashes with spaces
}

/** Returns the first h1 heading in a Markdown string. */
function findFirstHeading(sourceFileText: string) {
  const headingRegex = /(^|\n)#\s(.+)/
  const match = sourceFileText.match(headingRegex)
  if (match) {
    return match[2]
  }
  return null
}

/** Returns the metadata from a source file. */
function getMetadata(sourceFile: SourceFile) {
  const metadataExport = sourceFile.getVariableDeclaration('metadata')
  if (metadataExport) {
    const metadata = resolveExpression(metadataExport.getInitializer()!)
    return metadata as Record<string, any>
  }
  return null
}
