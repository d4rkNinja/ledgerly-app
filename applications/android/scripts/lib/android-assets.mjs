import { createHash } from 'node:crypto'
import {
  mkdir,
  readFile,
  writeFile,
} from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const LIGHT = '#f1f5f2'
const DARK = '#0b120e'
const BRAND_COLORS = ['#17483A', '#A6B58A', '#20272B']
const PNG_OPTIONS = {
  adaptiveFiltering: false,
  compressionLevel: 9,
  palette: false,
}
const DENSITIES = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
]
const SPLASH_DENSITIES = [
  ['mdpi', 320, 480],
  ['hdpi', 480, 800],
  ['xhdpi', 720, 1280],
  ['xxhdpi', 960, 1600],
  ['xxxhdpi', 1280, 1920],
]

function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

async function writeOutput(projectRoot, relativePath, contents) {
  const absolutePath = path.join(projectRoot, ...relativePath.split('/'))
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, contents)
  return {
    path: relativePath,
    sha256: sha256(contents),
  }
}

function loadSharp(projectRoot) {
  const packageFiles = [
    path.join(projectRoot, 'package.json'),
    path.join(process.cwd(), 'package.json'),
    path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '..',
      '..',
      '..',
      '..',
      'web',
      'package.json',
    ),
  ]
  let lastError
  for (const packageFile of [...new Set(packageFiles)]) {
    try {
      return createRequire(packageFile)('sharp')
    } catch (error) {
      lastError = error
      if (error?.code !== 'MODULE_NOT_FOUND') {
        throw error
      }
    }
  }
  throw lastError
}

function canvas(sharp, width, height, background) {
  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background,
    },
  })
}

async function markBuffer(sharp, source, size, monochrome = false) {
  let renderer = sharp(source)
  if (monochrome) {
    renderer = renderer
      .flatten({ background: '#000000' })
      .tint('#000000')
      .ensureAlpha()
  }
  return renderer
    .resize(size, size, { fit: 'contain' })
    .png(PNG_OPTIONS)
    .toBuffer()
}

async function composeSquare(sharp, source, size, markSize, background, opaque) {
  const mark = await markBuffer(sharp, source, markSize)
  let renderer = canvas(sharp, size, size, background).composite([
    {
      input: mark,
      left: Math.floor((size - markSize) / 2),
      top: Math.floor((size - markSize) / 2),
    },
  ])
  if (opaque) {
    renderer = renderer.flatten({ background }).removeAlpha().toColourspace('srgb')
  }
  return renderer.png(PNG_OPTIONS).toBuffer()
}

async function resizePng(sharp, input, width, height, options = {}) {
  let renderer = sharp(input).resize(width, height, {
    fit: options.fit ?? 'contain',
    background: options.background ?? { r: 0, g: 0, b: 0, alpha: 0 },
  })
  if (options.opaque) {
    renderer = renderer
      .flatten({ background: options.background })
      .removeAlpha()
      .toColourspace('srgb')
  }
  return renderer.png(PNG_OPTIONS).toBuffer()
}

const ADAPTIVE_ICON = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
`

const ADAPTIVE_ICON_MONOCHROME = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`

const MONOCHROME_VECTOR = `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="108"
    android:viewportHeight="108">
    <group
        android:scaleX="1.4"
        android:scaleY="1.4"
        android:translateX="17.2"
        android:translateY="17.2">
        <path android:fillColor="#000000" android:pathData="M6,4h11v26c0,7.18 5.82,13 13,13h17v7H29C16.3,50 6,39.7 6,27V4Z" />
        <path android:fillColor="#000000" android:pathData="M21,13 31,7v31c-5.52,0 -10,-4.48 -10,-10V13Z" />
        <path android:fillColor="#000000" android:pathData="M34,7 46,13v14.5c-4.94,2.19 -8.92,5.64 -12,10.5V7Z" />
        <path android:fillColor="#000000" android:pathData="M34,42c0.35,-6.93 4.5,-12.08 12,-14.5V33c0,4.97 -4.03,9 -9,9h-3Z" />
    </group>
</vector>
`

export async function generateAndroidAssets(options = {}) {
  const sourceRoot = path.resolve(
    options.sourceRoot ?? options.projectRoot ?? process.cwd(),
  )
  const outputRoot = path.resolve(
    options.outputRoot ?? options.projectRoot ?? process.cwd(),
  )
  const sourcePath = path.join(sourceRoot, 'public', 'logo.svg')
  const source = await readFile(sourcePath)
  const sharp = loadSharp(sourceRoot)
  const sourceText = source.toString('utf8')
  for (const color of BRAND_COLORS) {
    if (!sourceText.includes(color)) {
      throw new Error(`The canonical Ledgerly logo is missing brand fill ${color}.`)
    }
  }

  const outputs = []
  outputs.push(await writeOutput(outputRoot, 'assets/logo.svg', source))
  outputs.push(await writeOutput(outputRoot, 'assets/logo-dark.svg', source))

  const iconOnly = await composeSquare(sharp, source, 1024, 700, LIGHT, true)
  const foregroundMark = await markBuffer(sharp, source, 640)
  const iconForeground = await canvas(sharp, 1024, 1024, {
    r: 0,
    g: 0,
    b: 0,
    alpha: 0,
  })
    .composite([{ input: foregroundMark, left: 192, top: 192 }])
    .png(PNG_OPTIONS)
    .toBuffer()
  const iconBackground = await canvas(sharp, 1024, 1024, LIGHT)
    .flatten({ background: LIGHT })
    .removeAlpha()
    .toColourspace('srgb')
    .png(PNG_OPTIONS)
    .toBuffer()
  const splash = await composeSquare(sharp, source, 2732, 620, LIGHT, true)
  const splashDark = await composeSquare(sharp, source, 2732, 620, DARK, true)
  const playStore = await composeSquare(sharp, source, 512, 350, LIGHT, true)

  for (const [relativePath, contents] of [
    ['assets/icon-only.png', iconOnly],
    ['assets/icon-foreground.png', iconForeground],
    ['assets/icon-background.png', iconBackground],
    ['assets/splash.png', splash],
    ['assets/splash-dark.png', splashDark],
    ['resources/play-store-icon.png', playStore],
  ]) {
    outputs.push(await writeOutput(outputRoot, relativePath, contents))
  }

  for (const [density, legacySize, foregroundSize] of DENSITIES) {
    const base = `native/android/app/src/main/res/mipmap-${density}`
    const legacy = await resizePng(sharp, iconOnly, legacySize, legacySize, {
      background: LIGHT,
      opaque: true,
    })
    const foreground = await resizePng(
      sharp,
      iconForeground,
      foregroundSize,
      foregroundSize,
    )
    outputs.push(await writeOutput(outputRoot, `${base}/ic_launcher.png`, legacy))
    outputs.push(
      await writeOutput(outputRoot, `${base}/ic_launcher_round.png`, legacy),
    )
    outputs.push(
      await writeOutput(
        outputRoot,
        `${base}/ic_launcher_foreground.png`,
        foreground,
      ),
    )
  }

  for (const [density, portraitWidth, portraitHeight] of SPLASH_DENSITIES) {
    const portrait = await resizePng(sharp, splash, portraitWidth, portraitHeight, {
      background: LIGHT,
      fit: 'cover',
      opaque: true,
    })
    const landscape = await resizePng(sharp, splash, portraitHeight, portraitWidth, {
      background: LIGHT,
      fit: 'cover',
      opaque: true,
    })
    outputs.push(
      await writeOutput(
        outputRoot,
        `native/android/app/src/main/res/drawable-port-${density}/splash.png`,
        portrait,
      ),
    )
    outputs.push(
      await writeOutput(
        outputRoot,
        `native/android/app/src/main/res/drawable-land-${density}/splash.png`,
        landscape,
      ),
    )
  }

  const splashIcon = await resizePng(sharp, iconForeground, 288, 288)
  outputs.push(
    await writeOutput(
      outputRoot,
      'native/android/app/src/main/res/drawable/splash_icon.png',
      splashIcon,
    ),
  )
  outputs.push(
    await writeOutput(
      outputRoot,
      'native/android/app/src/main/res/drawable/splash.png',
      await resizePng(sharp, splash, 1280, 1280, {
        background: LIGHT,
        opaque: true,
      }),
    ),
  )
  outputs.push(
    await writeOutput(
      outputRoot,
      'native/android/app/src/main/res/drawable/ic_launcher_monochrome.xml',
      MONOCHROME_VECTOR,
    ),
  )
  for (const directory of ['mipmap-anydpi-v26', 'mipmap-anydpi-v33']) {
    const xml =
      directory === 'mipmap-anydpi-v33'
        ? ADAPTIVE_ICON_MONOCHROME
        : ADAPTIVE_ICON
    outputs.push(
      await writeOutput(
        outputRoot,
        `native/android/app/src/main/res/${directory}/ic_launcher.xml`,
        xml,
      ),
    )
    outputs.push(
      await writeOutput(
        outputRoot,
        `native/android/app/src/main/res/${directory}/ic_launcher_round.xml`,
        xml,
      ),
    )
  }

  outputs.sort((left, right) =>
    left.path < right.path
      ? -1
      : left.path > right.path
        ? 1
        : 0,
  )
  const manifest = {
    files: outputs,
    renderer: 'sharp@0.35.3',
    source: {
      path: 'public/logo.svg',
      sha256: sha256(source),
    },
  }
  await writeOutput(
    outputRoot,
    'assets/android-assets.sha256.json',
    `${JSON.stringify(manifest, null, 2)}\n`,
  )
  return manifest
}

export default generateAndroidAssets
