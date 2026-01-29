#!/usr/bin/env Rscript
#' Generate self-contained iframe HTML with embedded audio for R Markdown/Quarto
#'
#' Command-line usage:
#'   Rscript create-data-url.R audio.wav
#'   Rscript create-data-url.R audio.wav "pitch,formants,hnr"
#'   Rscript create-data-url.R audio.wav "pitch,formants" "https://mysite.com/viewer.html"
#'
#' Usage in R Markdown/Quarto:
#'   source("scripts/create-data-url.R")
#'   html <- create_embedded_viewer("audio.wav", overlays = "pitch,formants,hnr")
#'   htmltools::HTML(html)

create_embedded_viewer <- function(audio_path, overlays = "pitch,formants", viewer_url = "viewer.html") {
  if (!requireNamespace("base64enc", quietly = TRUE)) {
    stop("Package 'base64enc' required. Install with: install.packages('base64enc')")
  }

  # Check file exists
  if (!file.exists(audio_path)) {
    stop(paste("Audio file not found:", audio_path))
  }

  # Check file size
  size_mb <- file.info(audio_path)$size / (1024 * 1024)
  if (size_mb > 1.5) {
    warning(sprintf("File is %.1fMB. Data URLs are limited to ~1.5MB. Consider using a remote URL.", size_mb))
  }

  # Read and encode
  audio_data <- readBin(audio_path, "raw", file.info(audio_path)$size)
  b64 <- base64enc::base64encode(audio_data)

  # Create data URL
  data_url <- paste0("data:audio/wav;base64,", b64)

  # URL encode
  encoded <- URLencode(data_url, reserved = TRUE)

  # Create iframe
  iframe <- sprintf(
    '<iframe
  src="%s?audio=%s&overlays=%s"
  width="100%%"
  height="600"
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>',
    viewer_url,
    encoded,
    overlays
  )

  return(iframe)
}

# Command-line interface (only runs when executed as a script, not when sourced)
if (sys.nframe() == 0) {
  args <- commandArgs(trailingOnly = TRUE)

  if (length(args) < 1) {
    cat("Usage: Rscript create-data-url.R <audio-file> [overlays] [viewer-url]\n")
    cat("Example: Rscript create-data-url.R audio.wav 'pitch,formants,hnr' 'viewer.html'\n")
    quit(status = 1)
  }

  audio_path <- args[1]
  overlays <- if (length(args) >= 2) args[2] else "pitch,formants"
  viewer_url <- if (length(args) >= 3) args[3] else "viewer.html"

  tryCatch({
    html <- create_embedded_viewer(audio_path, overlays, viewer_url)
    cat(html, "\n")
  }, error = function(e) {
    cat("Error:", conditionMessage(e), "\n", file = stderr())
    quit(status = 1)
  })
}
