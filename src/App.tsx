/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import QRCodeStyling, {
  Options,
  DrawType,
  TypeNumber,
  Mode,
  ErrorCorrectionLevel,
  DotType,
  CornerSquareType,
  CornerDotType
} from "qr-code-styling";
import jsQR from "jsqr";
import { BrowserMultiFormatReader } from "@zxing/library";
import { 
  Download, 
  Link as LinkIcon, 
  Palette, 
  Settings, 
  Upload, 
  RefreshCw, 
  Check, 
  Layout, 
  Image as ImageIcon,
  Scan,
  Type
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Custom types for our state
type Extension = "png" | "jpeg" | "webp" | "svg";

/* ------------------------------------------------------------------ */
/*  QR DECODING ENGINE                                                 */
/*  ------------------------------------------------------------------ */
/*  qrcode-reader (the old library) decodes the raw pixel data with   */
/*  no preprocessing at all, so it fails constantly on real-world     */
/*  images: phone photos, low contrast, large resolutions, slight     */
/*  rotation, JPEG noise, non-white backgrounds, etc.                 */
/*                                                                      */
/*  This new pipeline, built on jsQR, instead:                        */
/*   1. Draws the image onto a canvas at several candidate scales     */
/*      (jsQR — like most QR detectors — works best when the QR      */
/*      modules are a handful of pixels wide, not thousands).         */
/*   2. Tries both normal and inverted luminance (light-on-dark QRs). */
/*   3. Applies contrast stretching so washed-out / low-contrast      */
/*      photos still binarize cleanly.                                */
/*   4. Stops at the first successful decode, trying progressively    */
/*      more aggressive strategies only if needed.                    */
/* ------------------------------------------------------------------ */

interface DecodeAttempt {
  label: string;
  canvas: HTMLCanvasElement;
  invert: boolean;
}

/** Loads a data URL into an HTMLImageElement. */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

/** Draws `img` onto a new canvas scaled so its longest side equals `targetSize`. */
function drawScaled(img: HTMLImageElement, targetSize: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const longest = Math.max(img.width, img.height);
  const scale = targetSize / longest;
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  // imageSmoothingEnabled true gives nicer downscaling for big photos;
  // for upscaling tiny QR crops we actually want it off so edges stay crisp.
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/** Stretches contrast (min-max normalization) on grayscale-equivalent luminance, in place. */
function applyContrastStretch(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const imageData = ctx.getImageData(0, 0, w, h);
  const data = imageData.data;

  let min = 255;
  let max = 0;
  for (let i = 0; i < data.length; i += 4) {
    const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }

  const range = max - min;
  if (range < 10) return; // already flat / no useful contrast info to stretch

  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const v = data[i + c];
      data[i + c] = Math.max(0, Math.min(255, ((v - min) / range) * 255));
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/** Builds the ordered list of decode attempts, cheapest/most-likely first. */
function buildAttempts(img: HTMLImageElement): DecodeAttempt[] {
  const attempts: DecodeAttempt[] = [];

  // Candidate target sizes. jsQR scans pixel-by-pixel, so very large
  // images are slow AND often harder to binarize evenly (uneven photo
  // lighting). Smaller, evenly-scaled versions are frequently easier
  // to decode for photographed (vs. clean screenshot) QR codes.
  const sizes = [800, 1200, 500, 350];

  for (const size of sizes) {
    const base = drawScaled(img, size);
    const ctx = base.getContext("2d")!;
    applyContrastStretch(ctx, base.width, base.height);
    attempts.push({ label: `scale-${size}`, canvas: base, invert: false });
  }

  return attempts;
}

/** Runs jsQR against a canvas, optionally inverting luminance first. */
function tryDecodeCanvas(canvas: HTMLCanvasElement, invert: boolean) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);

  if (invert) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
  }

  return jsQR(imageData.data, width, height, {
    inversionAttempts: "attemptBoth",
  });
}

/**
 * Attempts to decode a QR code from a data URL using multiple
 * scales and luminance strategies. Resolves with the decoded text,
 * or null if every attempt failed.
 */
async function decodeQrFromDataUrl(dataUrl: string): Promise<string | null> {
  const img = await loadImage(dataUrl);
  const attempts = buildAttempts(img);

  for (const attempt of attempts) {
    const result = tryDecodeCanvas(attempt.canvas, attempt.invert);
    if (result?.data) {
      return result.data;
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/*  MAXIMUM ROBUSTNESS FALLBACK — ZXing                                */
/*  ------------------------------------------------------------------ */
/*  jsQR is fast and handles the vast majority of real-world cases    */
/*  once preprocessed (see above). But it still struggles with:       */
/*    - Strong perspective distortion (QR photographed at an angle)   */
/*    - Partial occlusion / damaged corners                           */
/*    - Very low resolution or extreme blur                           */
/*    - Some non-standard QR variants (Micro QR, certain masks)       */
/*                                                                      */
/*  ZXing (the engine behind most production barcode scanners,        */
/*  including Android's) is significantly more tolerant of these      */
/*  cases, at the cost of being slower. We treat it as a *fallback*:  */
/*  only run it if every jsQR attempt above has already failed, so    */
/*  the common case stays fast and the worst-case still has a shot.   */
/* ------------------------------------------------------------------ */

let zxingReader: BrowserMultiFormatReader | null = null;
function getZxingReader(): BrowserMultiFormatReader {
  if (!zxingReader) {
    zxingReader = new BrowserMultiFormatReader();
  }
  return zxingReader;
}

/** Converts a canvas to an HTMLImageElement, since ZXing's browser API
 *  (in @zxing/library) decodes from <img>/<video> elements, not canvases
 *  directly — there is no `decodeFromCanvas` method on this package. */
function canvasToImage(canvas: HTMLCanvasElement): Promise<HTMLImageElement> {
  return loadImage(canvas.toDataURL("image/png"));
}

/**
 * Tries to decode using ZXing against the original image (it does its
 * own internal scaling/binarization) plus a couple of canvas variants
 * for extra coverage on rotated or low-contrast codes.
 */
async function decodeWithZxing(img: HTMLImageElement): Promise<string | null> {
  const reader = getZxingReader();

  // Candidate sources: a few rescaled/rotated canvases. ZXing's own
  // binarizer is quite good, so we lean mostly on its internal
  // processing rather than re-doing heavy prep here.
  const candidateCanvases: HTMLCanvasElement[] = [
    drawScaled(img, 1000),
    drawScaled(img, 600),
  ];

  // A few rotations to recover codes photographed at an angle.
  for (const angle of [90, 180, 270]) {
    const base = drawScaled(img, 800);
    const rotated = document.createElement("canvas");
    const isQuarterTurn = angle === 90 || angle === 270;
    rotated.width = isQuarterTurn ? base.height : base.width;
    rotated.height = isQuarterTurn ? base.width : base.height;
    const rctx = rotated.getContext("2d")!;
    rctx.translate(rotated.width / 2, rotated.height / 2);
    rctx.rotate((angle * Math.PI) / 180);
    rctx.drawImage(base, -base.width / 2, -base.height / 2);
    candidateCanvases.push(rotated);
  }

  for (const canvas of candidateCanvases) {
    try {
      const candidateImg = await canvasToImage(canvas);
      const result = await reader.decodeFromImageElement(candidateImg);
      if (result?.getText()) {
        return result.getText();
      }
    } catch {
      // ZXing throws (NotFoundException) when it can't find a code in
      // this candidate — that's expected and we just move to the next one.
      continue;
    }
  }

  return null;
}


/**
 * Full decode pipeline with an optional "maximum robustness" mode.
 *   - Always tries jsQR first (fast, covers most real cases).
 *   - If that fails and `maxRobustness` is enabled, falls back to
 *     ZXing with rotation variants (slower, but recovers much harder
 *     cases: perspective, heavy rotation, low resolution).
 * Returns the decoded text plus which engine succeeded, or null.
 */
async function decodeQr(
  dataUrl: string,
  maxRobustness: boolean
): Promise<{ text: string; engine: "jsQR" | "ZXing" } | null> {
  const img = await loadImage(dataUrl);

  const fastResult = await decodeQrFromDataUrl(dataUrl);
  if (fastResult) {
    return { text: fastResult, engine: "jsQR" };
  }

  if (maxRobustness) {
    const robustResult = await decodeWithZxing(img);
    if (robustResult) {
      return { text: robustResult, engine: "ZXing" };
    }
  }

  return null;
}

export default function App() {
  const [url, setUrl] = useState("https://google.com");
  const [dotsColor, setDotsColor] = useState("#000000");
  const [bgColor, setBgColor] = useState("#ffffff");
  const [dotsType, setDotsType] = useState<DotType>("rounded");
  const [cornersType, setCornersType] = useState<CornerSquareType>("extra-rounded");
  const [cornerDotsType, setCornerDotsType] = useState<CornerDotType>("dot");
  const [logo, setLogo] = useState<string | undefined>(undefined);
  const [qrPreview, setQrPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [maxRobustness, setMaxRobustness] = useState(false);
  const [scanEngine, setScanEngine] = useState<"jsQR" | "ZXing" | null>(null);

  const [downloadFormat, setDownloadFormat] = useState<Extension>("png");
  const [resolution, setResolution] = useState(1000);

  const qrRef = useRef<HTMLDivElement>(null);
  const qrCode = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    qrCode.current = new QRCodeStyling({
      width: 300,
      height: 300,
      data: url,
      margin: 10,
      dotsOptions: {
        color: dotsColor,
        type: dotsType,
      },
      backgroundOptions: {
        color: bgColor,
      },
      cornersSquareOptions: {
        type: cornersType,
        color: dotsColor,
      },
      cornersDotOptions: {
        type: cornerDotsType,
        color: dotsColor,
      },
      imageOptions: {
        crossOrigin: "anonymous",
        margin: 5,
        imageSize: 0.4
      }
    });

    if (qrRef.current) {
      qrCode.current.append(qrRef.current);
    }

    return () => {
      if (qrRef.current) {
        qrRef.current.innerHTML = "";
      }
    };
  }, []);

  useEffect(() => {
    if (qrCode.current) {
      qrCode.current.update({
        data: url,
        dotsOptions: {
          color: dotsColor,
          type: dotsType,
        },
        backgroundOptions: {
          color: bgColor,
        },
        cornersSquareOptions: {
          type: cornersType,
          color: dotsColor,
        },
        cornersDotOptions: {
          type: cornerDotsType,
          color: dotsColor,
        },
        image: logo,
      });
    }
  }, [url, dotsColor, bgColor, dotsType, cornersType, cornerDotsType, logo]);

  const handleDownload = () => {
    if (qrCode.current) {
      qrCode.current.download({
        name: "qr-studio-code",
        extension: downloadFormat,
      });
    }
  };

  const handleQrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setScanResult(null);
    setScanError(null);
    setScanEngine(null);
    if (!file) {
      setQrPreview(null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setQrPreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleQrScan = async () => {
    if (!qrPreview) return;

    setIsScanning(true);
    setScanResult(null);
    setScanError(null);
    setScanEngine(null);

    try {
      const result = await decodeQr(qrPreview, maxRobustness);

      setIsScanning(false);

      if (!result) {
        setScanError(
          maxRobustness
            ? "No se pudo leer el código QR ni con el modo de máxima robustez. Intenta con una foto más nítida, mejor luz, o más de cerca."
            : "No se pudo leer el código QR. Intenta con una foto más nítida, con mejor luz, o activa el modo de máxima robustez."
        );
        return;
      }

      setScanResult(result.text);
      setScanEngine(result.engine);
    } catch (error) {
      setIsScanning(false);
      setScanError("Error interno al procesar el QR.");
      console.error("Error decoding QR code:", error);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setLogo(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const resetLogo = () => setLogo(undefined);

  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1 }
  };

  return (
    <div className="min-h-screen bg-[#050507] text-white font-sans selection:bg-indigo-500/30 overflow-hidden relative">
      {/* Background Atmosphere */}
      <div className="absolute top-50 right-50 w-150 h-150 bg-indigo-600/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-25 left-25 w-125 h-125 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <div className="max-w-6xl mx-auto p-4 md:p-8 relative z-10">
        {/* Header */}
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-linear-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <RefreshCw className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-white to-gray-400 leading-none">
                QR STUDIO <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded ml-1 border border-indigo-500/30 align-middle">PRO</span>
              </h1>
              <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1">Crea códigos QR profesionales</p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-4">
            <div className="px-4 py-2 rounded-full bg-white/5 border border-white/10 text-[11px] font-bold text-gray-400">
              v4.3.0
            </div>
          </div>
        </motion.header>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid lg:grid-cols-12 gap-8 items-start"
        >
          {/* Left Panel: Controls */}
          <div className="lg:col-span-7 space-y-6">
            <motion.section variants={itemVariants} className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-2 mb-4 text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                <LinkIcon className="w-4 h-4" />
                <label>Source Destination</label>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://tu-sitio.com"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-white focus:outline-none focus:border-indigo-500 transition-colors text-lg"
                />
              </div>
            </motion.section>

            <motion.section variants={itemVariants} className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md">
              <div className="flex items-center gap-2 mb-8 text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                <Palette className="w-4 h-4" />
                <label>Appearance Settings</label>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                {/* Colors */}
                <div className="space-y-6">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 block">
                      Dot Architecture
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-xl shadow-inner border border-white/10 overflow-hidden relative bg-black/40">
                        <input
                          type="color"
                          value={dotsColor}
                          onChange={(e) => setDotsColor(e.target.value)}
                          className="absolute -inset-2 w-[200%] h-[200%] cursor-pointer border-none p-0 bg-transparent"
                        />
                      </div>
                      <input
                        type="text"
                        value={dotsColor}
                        onChange={(e) => setDotsColor(e.target.value)}
                        className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm font-mono uppercase text-gray-300 outline-none focus:border-indigo-500/50"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2 block">
                      Canvas Base
                    </label>
                    <div className="flex items-center gap-4">
                      <div className="h-14 w-14 rounded-xl shadow-inner border border-white/10 overflow-hidden relative bg-black/40">
                        <input
                          type="color"
                          value={bgColor}
                          onChange={(e) => setBgColor(e.target.value)}
                          className="absolute -inset-2 w-[200%] h-[200%] cursor-pointer border-none p-0 bg-transparent"
                        />
                      </div>
                      <input
                        type="text"
                        value={bgColor}
                        onChange={(e) => setBgColor(e.target.value)}
                        className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-sm font-mono uppercase text-gray-300 outline-none focus:border-indigo-500/50"
                      />
                    </div>
                  </div>
                </div>

                {/* Logo Upload */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3 block">
                    Identity Mask (Optional)
                  </label>
                  <div className="space-y-3">
                    {!logo ? (
                      <label className="flex flex-col items-center justify-center w-full h-36 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group hover:border-indigo-500/50">
                        <Upload className="w-10 h-10 text-white/20 group-hover:text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                        <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Sube tu logo</span>
                        <input type="file" className="hidden" accept="image/*" onChange={handleLogoUpload} />
                      </label>
                    ) : (
                      <div className="relative group overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-1">
                        <div className="flex items-center gap-4 p-3 bg-black/20 rounded-xl">
                          <img src={logo} alt="Logo preview" className="w-16 h-16 object-contain bg-white rounded-xl p-2 shadow-sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-white truncate">Identidad activa</p>
                            <p className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest mt-0.5">Vector Overlay</p>
                          </div>
                          <button 
                            onClick={resetLogo}
                            className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Shapes */}
              <div className="mt-8 pt-8 border-t border-white/5 space-y-8">
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 block">
                    Structure geometry
                  </label>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {(['square', 'dots', 'rounded', 'extra-rounded', 'classy', 'classy-rounded'] as DotType[]).map((type) => (
                      <button
                        key={type}
                        onClick={() => setDotsType(type)}
                        className={`py-3 px-1 rounded-xl text-[9px] font-bold uppercase tracking-tight transition-all border ${
                          dotsType === type 
                            ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30 scale-[1.05]" 
                            : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                        }`}
                      >
                        {type.replace('-', ' ')}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid sm:grid-cols-2 gap-8">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 block">
                      Frame curvature
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(['square', 'dot', 'rounded', 'extra-rounded'] as CornerSquareType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setCornersType(type)}
                          className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-tight transition-all border ${
                            cornersType === type 
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30" 
                              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                          }`}
                        >
                          {type.replace('-', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500 mb-4 block">
                      Core focus
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                    {(['square', 'dot'] as CornerDotType[]).map((type) => (
                        <button
                          key={type}
                          onClick={() => setCornerDotsType(type)}
                          className={`py-3 rounded-xl text-[9px] font-bold uppercase tracking-tight transition-all border ${
                            cornerDotsType === type 
                              ? "bg-indigo-600 border-indigo-500 text-white shadow-lg shadow-indigo-600/30" 
                              : "bg-white/5 border-white/10 text-gray-400 hover:bg-white/10"
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            <motion.section variants={itemVariants} className="p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-2xl">
              <div className="flex items-center gap-2 mb-8 text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px]">
                <Scan className="w-4 h-4" />
                <label>QR Scanner</label>
              </div>
              <div className="grid gap-4">
                <label className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-white/10 rounded-2xl cursor-pointer hover:bg-white/5 transition-all group hover:border-indigo-500/50">
                  <Scan className="w-10 h-10 text-white/20 group-hover:text-indigo-400 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-[11px] text-gray-400 font-bold uppercase tracking-widest">Subir QR para leer</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleQrUpload} />
                </label>

                {qrPreview ? (
                  <div className="rounded-3xl overflow-hidden border border-white/10 bg-slate-950/30 p-3">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-gray-500 mb-3">Vista previa</p>
                    <img src={qrPreview} alt="QR preview" className="w-full max-h-60 object-contain rounded-2xl bg-black/20" />
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-white/10 bg-black/10 p-4 text-center text-[11px] text-gray-400">
                    Carga una imagen de QR para previsualizar aquí.
                  </div>
                )}

                <button
                  onClick={handleQrScan}
                  disabled={!qrPreview || isScanning}
                  className={`w-full py-3 rounded-2xl font-bold uppercase transition-all ${qrPreview && !isScanning ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500' : 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10'}`}
                >
                  {isScanning ? 'Escaneando...' : 'Escanear QR'}
                </button>

                <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-2xl bg-white/5 border border-white/10 cursor-pointer hover:bg-white/[0.07] transition-colors">
                  <div>
                    <p className="text-[11px] font-bold text-gray-200">Modo máxima robustez</p>
                    <p className="text-[9px] text-gray-500 mt-0.5">Más lento, recupera QR con ángulo, rotación o calidad muy baja</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={maxRobustness}
                    onClick={() => setMaxRobustness((v) => !v)}
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${maxRobustness ? "bg-indigo-600" : "bg-white/10"}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-transform ${maxRobustness ? "translate-x-5" : "translate-x-0"}`}
                    />
                  </button>
                </label>

                {scanResult && (
                  <div className="p-4 rounded-3xl bg-green-500/10 border border-green-500/20 text-white">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[10px] uppercase tracking-[0.35em] text-green-300">Resultado</p>
                      {scanEngine && (
                        <span className="text-[9px] font-bold uppercase tracking-wider text-green-400/70 bg-green-500/10 px-2 py-0.5 rounded-full border border-green-500/20">
                          {scanEngine === "ZXing" ? "Motor robusto" : "Lectura rápida"}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-mono wrap-break-words">{scanResult}</p>
                  </div>
                )}

                {scanError && (
                  <div className="p-4 rounded-3xl bg-red-500/10 border border-red-500/20 text-red-200">
                    <p className="text-[10px] uppercase tracking-[0.35em] text-red-300 mb-2">Error</p>
                    <p className="text-sm">{scanError}</p>
                  </div>
                )}
              </div>
            </motion.section>
          </div>

          {/* Right Panel: Preview & Download */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-8">
            <motion.section variants={itemVariants} className="p-8 rounded-[48px] bg-linear-to-br from-white/10 to-transparent border border-white/20 backdrop-blur-2xl shadow-[0_0_80px_-20px_rgba(99,102,241,0.2)] flex flex-col items-center">
              <div className="flex items-center gap-2 mb-8 w-full text-indigo-400 font-bold uppercase tracking-[0.2em] text-[10px] self-start">
                <Layout className="w-4 h-4" />
                <h2 className="text-xs">Live Matrix Render</h2>
              </div>
              
              <div className="relative group">
                <div className="absolute -inset-8 bg-indigo-500/10 rounded-full opacity-50 group-hover:opacity-100 transition-opacity duration-1000 -z-10 blur-[60px]" />
                <div 
                  className="rounded-2xl shadow-2xl transition-all duration-500 group-hover:scale-[1.02] overflow-hidden flex items-center justify-center border border-white/10" 
                  ref={qrRef} 
                  style={{ width: '300px', height: '300px', backgroundColor: bgColor }}
                />
              </div>

              <div className="w-full mt-10 space-y-6">
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2 block text-center">
                      Export Profile
                    </label>
                    <div className="flex bg-black/40 p-1.5 rounded-2xl border border-white/5">
                      {(["png", "svg", "webp", "jpeg"] as Extension[]).map((ext) => (
                        <button
                          key={ext}
                          onClick={() => setDownloadFormat(ext)}
                          className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase transition-all ${
                            downloadFormat === ext 
                              ? "bg-indigo-600 text-white shadow-lg" 
                              : "text-gray-500 hover:text-gray-300"
                          }`}
                        >
                          {ext}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  onClick={handleDownload}
                  className="group w-full bg-linear-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold py-5 rounded-2xl shadow-xl shadow-indigo-600/20 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
                >
                  <Download className="w-6 h-6" />
                  <span className="text-lg">DOWNLOAD VECTOR</span>
                </button>
                
                <div className="flex items-center justify-center gap-4 py-2 opacity-50">
                  <span className="h-px bg-white/10 flex-1" />
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.3em]">
                    4096 PX LOSSLESS
                  </p>
                  <span className="h-px bg-white/10 flex-1" />
                </div>
              </div>
            </motion.section>

            {/* Status Footer (Immersive UI footer style) */}
            <motion.footer variants={itemVariants} className="pt-4 border-t border-white/5 flex justify-between items-center px-4">
              <div className="flex gap-6">
                <div className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Engine: Active</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase font-bold tracking-tighter">Resolution: <span className="text-gray-300">Ultra High</span></span>
                </div>
              </div>
              <span className="text-[9px] text-gray-600 font-bold uppercase tracking-wider">Aura v4.2 PRO</span>
            </motion.footer>
          </div>
        </motion.div>
      </div>
    </div>
  );
}