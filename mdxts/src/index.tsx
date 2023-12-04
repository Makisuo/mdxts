import title from 'title'
import type { ComponentType } from 'react'
import { kebabCase } from 'case-anything'
import type { CodeBlocks } from './remark/add-code-blocks'
import type { Headings } from './remark/add-headings'

export type Module = {
  Component: ComponentType
  title: string
  pathname: string
  slug: string
  headings: Headings
  codeBlocks: CodeBlocks
  summary: string
  metadata?: { title: string; description: string }
}

/**
 * Loads modules and parses metadata from Webpack `require.context`.
 *
 * @example
 * export const allDocs = loadModules(
 *   require.context('./docs', true, /\.mdx$/, 'lazy'),
 *   'docs'
 * )
 */
export function createSourceFiles<Type>(
  pattern: string,
  options: { baseDirectory?: string } = {}
) {
  const allModules = pattern as unknown as Record<
    string,
    Promise<{ default: any } & Omit<Module, 'Component'> & Type>
  >

  if (typeof allModules === 'string') {
    throw new Error(
      'mdxts: createSourceFiles requires the mdxts/loader package is configured as a Webpack loader.'
    )
  }

  const globPattern = options as unknown as string
  const { baseDirectory = '' } = (arguments[2] || {}) as unknown as {
    baseDirectory: string
  }

  const allModulesKeysByPathname = Object.fromEntries(
    Object.keys(allModules).map((key) => {
      const pathname = filePathToUrl(key, baseDirectory)
      return [pathname, key]
    })
  )

  /** Parses and attaches metadata to a module. */
  async function parseModule(pathname?: string) {
    if (pathname === undefined) {
      return null
    }

    const moduleKey = allModulesKeysByPathname[pathname]

    if (moduleKey === undefined) {
      return null
    }

    const {
      default: Component,
      headings,
      metadata,
      ...exports
    } = await allModules[moduleKey]
    const slug = pathname.split('/').pop()

    return {
      Component,
      title: metadata?.title || headings?.[0]?.text || title(slug),
      pathname: `/${pathname}`,
      headings,
      metadata,
      ...exports,
    } as Module & Type
  }

  /** Returns the active and sibling data based on the active pathname. */
  async function getPathData(
    /** The pathname of the active page. */
    pathname: string[]
  ): Promise<{
    active?: Module
    previous?: Module
    next?: Module
  }> {
    const activeIndex = Object.keys(allModulesKeysByPathname).findIndex(
      (dataPathname) => dataPathname.includes(pathname.join('/'))
    )

    function getSiblingPathname(startIndex: number, direction: number) {
      const siblingIndex = startIndex + direction
      const siblingPathname = Object.keys(allModulesKeysByPathname)[
        siblingIndex
      ]
      if (siblingPathname === null) {
        return getSiblingPathname(siblingIndex, direction)
      }
      return siblingPathname
    }

    const [active, previous, next] = await Promise.all([
      parseModule(pathname.join('/')),
      parseModule(getSiblingPathname(activeIndex, -1)),
      parseModule(getSiblingPathname(activeIndex, 1)),
    ])

    if (active === null) {
      return null
    }

    return { active, previous, next } as Record<
      'active' | 'previous' | 'next',
      Module & Type
    >
  }

  return {
    async all() {
      const allModules = await Promise.all(
        Object.keys(allModulesKeysByPathname).map((pathname) =>
          parseModule(pathname)
        )
      )
      return Object.fromEntries(
        Object.keys(allModulesKeysByPathname).map((pathname, index) => [
          pathname,
          allModules[index],
        ])
      )
    },
    async get(pathname: string[]) {
      const data = await getPathData(pathname)
      return data
    },
    paths(): string[][] {
      return Object.keys(allModulesKeysByPathname).map((pathname) =>
        pathname
          // Split pathname into an array
          .split('/')
          // Remove empty strings
          .filter(Boolean)
      )
    },
  }
}

/** Converts a file system path to a URL-friendly path. */
function filePathToUrl(filepath: string, baseDirectory?: string) {
  const parsedFilepath = filepath
    // Remove file extensions
    .replace(/\.[^/.]+$/, '')
    // Remove leading separator "./"
    .replace(/^\.\//, '')
    // Remove leading sorting number
    .replace(/\/\d+\./g, '/')
    // Remove base directory
    .replace(baseDirectory ? `${baseDirectory}/` : '', '')
    // Remove trailing "/README" or "/index"
    .replace(/\/(README|index)$/, '')
    // Remove working directory
    .replace(process.cwd(), '')

  // Convert component names to kebab case for case-insensitive paths
  const segments = parsedFilepath.split('/')

  return segments
    .map((segment) => (/[A-Z]/.test(segment[0]) ? kebabCase(segment) : segment))
    .filter(Boolean)
    .join('/')
}
