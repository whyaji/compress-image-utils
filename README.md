# Mass Image Compression Service

A powerful, interactive command-line utility built with [Bun](https://bun.sh/) and [Sharp](https://sharp.pixelplumbing.com/) to mass-compress and resize images in a directory.

## Features

- **Mass Compression**: Recursively finds and compresses images (`.jpg`, `.jpeg`, `.png`, `.webp`, `.tiff`, `.bmp`, `.gif`) in a target directory.
- **Size Filtering**: Only targets images that are larger than a specified minimum file size.
- **Smart Target Size**: Uses a binary search algorithm to intelligently adjust image quality, aiming to get the image as close to your requested max file size as possible.
- **Optional Resizing**: Allows setting a maximum height (in pixels). Large images will be resized down to this height while preserving their original aspect ratio.
- **Automatic Backups**: Safely copies original images to a local `temp/YYYYMMDD/HHMM` directory within this project before overwriting the originals with the compressed versions.
- **Detailed Reporting**: Generates a detailed `info.json` report in the backup directory containing all run configurations and a breakdown of original vs. compressed sizes for each file.

## Prerequisites

- [Bun](https://bun.sh/) installed on your machine.

## Installation

1. Clone or download this repository.
2. Install the dependencies:

```bash
bun install
```

## Usage

To start the interactive compression script, run:

```bash
bun compress
```

_(Or alternatively: `bun run compress.ts`)_

### Interactive Prompts

Upon running the script, you will be prompted for the following:

1. **Input folder path**: The absolute path to the directory containing the images you want to compress.
2. **Minimum original file size to compress (in KB)**: Images smaller than this size will be skipped.
3. **Max size after compress (in KB)**: The script will attempt to compress the image to be at or below this target size.
4. **Max height in pixels**: _(Optional)_ Enter a pixel value to resize the image height before compressing. Press `Enter` to skip resizing.

After providing the inputs, a summary will be displayed. You must type `y` to confirm and proceed with the operation.

## Outputs

- **Compressed Images**: Overwritten in your original input folder.
- **Original Backups**: Saved in `./temp/[DATE]/[TIME]/` within this project folder.
- **Report**: Saved as `info.json` inside the backup folder mentioned above.
