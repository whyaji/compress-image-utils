import fs from 'fs/promises';
import path from 'path';
import readline from 'readline/promises';
import sharp from 'sharp';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const TEMP_BASE_DIR = path.join(process.cwd(), 'temp');

async function compressImageToSize(
  inputPath: string,
  outputPath: string,
  maxSizeBytes: number,
  maxHeight?: number
) {
  let fileBuffer: any = await fs.readFile(inputPath);

  const metadata = await sharp(fileBuffer).metadata();
  const format = metadata.format || 'jpeg';

  if (maxHeight && metadata.height && metadata.height > maxHeight) {
    fileBuffer = await sharp(fileBuffer)
      .resize({ height: maxHeight, withoutEnlargement: true })
      .toBuffer();
  }

  if (fileBuffer.length <= maxSizeBytes) {
    // Already smaller than max size and optionally resized, just copy or return
    await fs.writeFile(outputPath, fileBuffer);
    return fileBuffer.length;
  }

  let minQ = 10;
  let maxQ = 100;
  let bestBuffer: any = fileBuffer;
  let bestSize = fileBuffer.length;

  let smallestBuffer: any = null;
  let smallestSize = Infinity;

  // Binary search for optimal quality that fits within maxSizeBytes
  while (minQ <= maxQ) {
    const midQ = Math.floor((minQ + maxQ) / 2);
    let currentBuffer: any;

    try {
      const pipeline = sharp(fileBuffer);
      if (format === 'jpeg' || format === 'jpg') {
        currentBuffer = await pipeline.jpeg({ quality: midQ }).toBuffer();
      } else if (format === 'png') {
        currentBuffer = await pipeline.png({ quality: midQ, effort: 8 }).toBuffer();
      } else if (format === 'webp') {
        currentBuffer = await pipeline.webp({ quality: midQ }).toBuffer();
      } else if (format === 'tiff') {
        currentBuffer = await pipeline.tiff({ quality: midQ }).toBuffer();
      } else if (format === 'gif') {
        // GIF doesn't strictly support quality scaling like JPEGs
        currentBuffer = await pipeline.gif().toBuffer();
      } else {
        // Preserve exact original type, whatever it is
        currentBuffer = await pipeline
          .toFormat(format as keyof sharp.FormatEnum, { quality: midQ })
          .toBuffer();
      }

      if (currentBuffer.length < smallestSize) {
        smallestSize = currentBuffer.length;
        smallestBuffer = currentBuffer;
      }

      if (currentBuffer.length <= maxSizeBytes) {
        bestBuffer = currentBuffer;
        bestSize = currentBuffer.length;
        minQ = midQ + 1; // Try to get higher quality that still fits
      } else {
        maxQ = midQ - 1; // Need smaller size
      }
    } catch (err) {
      console.error(`\nError processing at quality ${midQ}`, err);
      break;
    }
  }

  // If we never found a buffer that fits the exact max size constraint,
  // fallback to the most compressed version we were able to generate!
  if (bestSize > maxSizeBytes && smallestBuffer) {
    bestBuffer = smallestBuffer;
    bestSize = smallestSize;
  }

  await fs.writeFile(outputPath, bestBuffer);
  return bestSize;
}

async function main() {
  try {
    const inputFolder = await rl.question('Enter input folder path: ');
    const isRecursiveInput = await rl.question('Process recursively through subfolders? (y/n): ');
    const isRecursive = isRecursiveInput.toLowerCase().trim() === 'y';
    const isBackupInput = await rl.question('Backup original images to temp folder? (y/n): ');
    const isBackup = isBackupInput.toLowerCase().trim() === 'y';

    const minOriginalSizeInput = await rl.question(
      'Enter minimum original file size to compress (in KB): '
    );

    const minOriginalSizeBytes = parseFloat(minOriginalSizeInput) * 1024;
    if (isNaN(minOriginalSizeBytes) || minOriginalSizeBytes < 0) {
      console.error('Invalid minimum original size. Please enter a valid number.');
      return;
    }

    const maxSizeInput = await rl.question('Enter max size after compress (in KB): ');
    const maxHeightInput = await rl.question(
      'Enter max height in pixels (optional, press Enter to skip): '
    );

    const maxSizeBytes = parseFloat(maxSizeInput) * 1024;
    if (isNaN(maxSizeBytes) || maxSizeBytes <= 0) {
      console.error('Invalid max size. Please enter a valid number.');
      return;
    }

    let maxHeight: number | undefined = undefined;
    if (maxHeightInput.trim() !== '') {
      maxHeight = parseInt(maxHeightInput.trim(), 10);
      if (isNaN(maxHeight) || maxHeight <= 0) {
        console.error('Invalid max height. Ignoring resize parameter.');
        maxHeight = undefined;
      }
    }

    const stat = await fs.stat(inputFolder).catch(() => null);
    if (!stat || !stat.isDirectory()) {
      console.error('Input path is not a valid directory.');
      return;
    }

    // Prepare temp backup folder
    const now = new Date();
    const dateStr =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0');
    const timeStr =
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');

    let backupDir = '';
    if (isBackup) {
      backupDir = path.join(TEMP_BASE_DIR, dateStr, timeStr);
      await fs.mkdir(backupDir, { recursive: true });
    }

    // Read all files
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.bmp', '.gif'];
    const imagesToProcess: string[] = [];

    async function findImages(dirPath: string) {
      const files = await fs.readdir(dirPath, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dirPath, file.name);
        if (file.isDirectory()) {
          if (isRecursive) {
            await findImages(fullPath);
          }
        } else {
          const ext = path.extname(file.name).toLowerCase();
          if (imageExtensions.includes(ext)) {
            const fileStat = await fs.stat(fullPath);
            if (fileStat.size >= minOriginalSizeBytes) {
              imagesToProcess.push(fullPath);
            }
          }
        }
      }
    }

    await findImages(inputFolder);

    if (imagesToProcess.length === 0) {
      console.log(
        `No images found in the specified folder matching the size criteria (>= ${minOriginalSizeInput} KB).`
      );
      return;
    }

    console.log('\n=== COMPRESSION SUMMARY ===');
    console.log(`Target Folder: ${inputFolder}`);
    console.log(`Recursive: ${isRecursive ? 'Yes' : 'No'}`);
    console.log(`Backup Originals: ${isBackup ? 'Yes' : 'No'}`);
    console.log(`Min Original Size: ${minOriginalSizeInput} KB`);
    console.log(`Target Max Size: ${maxSizeInput} KB`);
    console.log(`Max Height: ${maxHeight ? maxHeight + 'px' : 'None'}`);
    console.log(`Images Found: ${imagesToProcess.length}`);
    console.log('===========================\n');

    const confirmation = await rl.question('Do you want to proceed? (y/n): ');
    if (confirmation.toLowerCase().trim() !== 'y') {
      console.log('Operation aborted by user.');
      return;
    }

    console.log(`\nStarting compression...`);
    if (isBackup) {
      console.log(`Original images will be backed up to: ${backupDir}\n`);
    } else {
      console.log(`WARNING: Originals will be overwritten without backup!\n`);
    }

    const infoList = [];
    const totalImages = imagesToProcess.length;
    let processedImages = 0;

    for (const originalPath of imagesToProcess) {
      const relativePath = path.relative(inputFolder, originalPath);
      let backupPath = '';
      let pathForCompressionInput = originalPath;

      const originalStat = await fs.stat(originalPath);
      const originalSize = originalStat.size;

      if (isBackup) {
        backupPath = path.join(backupDir, relativePath);
        // Create subdirectories in backup folder if needed
        await fs.mkdir(path.dirname(backupPath), { recursive: true });

        // 1. Backup original
        await fs.copyFile(originalPath, backupPath);
        pathForCompressionInput = backupPath;
      }

      // 2. Compress and save to original path
      const percentage = Math.round((processedImages / totalImages) * 100);
      const filledBarLength = Math.round((processedImages / totalImages) * 40);
      const filledBar = '█'.repeat(filledBarLength);
      const emptyBar = '░'.repeat(40 - filledBarLength);
      const shortPath = relativePath.length > 30 ? '...' + relativePath.slice(-27) : relativePath;

      process.stdout.write(
        `\r\x1b[KProgress: [${filledBar}${emptyBar}] ${percentage}% (${processedImages}/${totalImages}) | Compressing: ${shortPath}`
      );

      const newSize = await compressImageToSize(
        pathForCompressionInput,
        originalPath,
        maxSizeBytes,
        maxHeight
      );

      // Clear progress bar line to print log
      process.stdout.write('\r\x1b[K');
      console.log(
        `Done: ${shortPath} | ${(originalSize / 1024).toFixed(2)} KB -> ${(newSize / 1024).toFixed(2)} KB`
      );
      // Re-print progress bar so it sits at the bottom
      process.stdout.write(
        `Progress: [${filledBar}${emptyBar}] ${percentage}% (${processedImages}/${totalImages}) | Compressing: ${shortPath}`
      );

      infoList.push({
        filename: relativePath,
        originalSizeBytes: originalSize,
        compressedSizeBytes: newSize,
        originalPathBackup: isBackup ? backupPath : 'none',
      });

      processedImages++;
    }

    // Final complete bar
    process.stdout.write(
      `\r\x1b[KProgress: [${'█'.repeat(40)}] 100% (${totalImages}/${totalImages}) | All images processed successfully!\n`
    );

    // 3. Create info.json ONLY if we backup
    if (isBackup) {
      const infoFilePath = path.join(backupDir, 'info.json');
      const infoData = {
        targetFolder: inputFolder,
        totalImagesProcessed: imagesToProcess.length,
        minOriginalSizeSettingKb: parseFloat(minOriginalSizeInput),
        maxSizeSettingKb: parseFloat(maxSizeInput),
        maxHeightSettingPx: maxHeight || 'none',
        processedAt: now.toISOString(),
        backupFolder: backupDir,
        images: infoList,
      };

      await fs.writeFile(infoFilePath, JSON.stringify(infoData, null, 2));
      console.log(`\nAll done! Compression info saved to: ${infoFilePath}`);
    } else {
      console.log(`\nAll done! (No backup/info.json saved)`);
    }
  } catch (error) {
    console.error('An error occurred:', error);
  } finally {
    rl.close();
  }
}

main();
