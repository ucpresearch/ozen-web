#!/usr/bin/env Rscript
#' Generate iframe HTML for embedding Ozen viewer with audio in R Markdown/Quarto
#'
#' Command-line usage:
#'   Rscript create-iframe.R audio.wav
#'   Rscript create-iframe.R audio.wav "pitch,formants,hnr"
#'   Rscript create-iframe.R audio.wav "pitch,formants" "./ozen-web/viewer.html"
#'   Rscript create-iframe.R audio.wav "pitch,formants" "./ozen-web/viewer.html" 800
#'   Rscript create-iframe.R audio.wav "pitch,formants" "./ozen-web/viewer.html" "80%"
#'
#' Usage in R Markdown/Quarto:
#'   source("scripts/create-iframe.R")
#'   html <- create_embedded_viewer("audio.wav", overlays = "pitch,formants,hnr")
#'   html <- create_embedded_viewer("audio.wav", overlays = "pitch,formants", height = 800)
#'   html <- create_embedded_viewer("audio.wav", overlays = "pitch,formants", height = "80%")
#'   htmltools::HTML(html)
#'
#' IMPORTANT: To view the generated HTML locally, you must serve it over HTTP:
#'   source("scripts/serve-quarto.R")
#'   serve_quarto()  # Serves on http://localhost:8000
#'
#' Browsers block file:// iframes for security, so double-clicking the HTML won't work.

calculate_relative_path <- function(audio_path, viewer_url) {
  #' Calculate the relative path from the viewer's directory to the audio file.
  #'
  #' @param audio_path Path to audio file (relative to current directory)
  #' @param viewer_url Path to viewer.html (e.g., "./ozen-web/viewer.html")
  #' @return Relative path from viewer's directory to audio file

  # Clean up paths (remove ./ prefix, normalize slashes)
  audio_clean <- gsub("^\\./", "", audio_path)
  viewer_clean <- gsub("^\\./", "", viewer_url)

  # Get viewer directory depth
  viewer_parts <- strsplit(viewer_clean, "/")[[1]]
  viewer_dir_depth <- length(viewer_parts) - 1  # -1 for the filename

  # Build relative path: go up from viewer dir, then to audio
  if (viewer_dir_depth > 0) {
    ups <- paste(rep("..", viewer_dir_depth), collapse = "/")
    relative_path <- paste(ups, audio_clean, sep = "/")
  } else {
    # Viewer is in current directory
    relative_path <- audio_clean
  }

  return(relative_path)
}

create_embedded_viewer <- function(audio_path, overlays = "pitch,formants", viewer_url = "./ozen-web/viewer.html", height = 600) {
  #' Create iframe HTML with audio path
  #'
  #' @param audio_path Path to audio file
  #' @param overlays Comma-separated list of overlays (default: "pitch,formants")
  #' @param viewer_url Path to viewer.html (default: "./ozen-web/viewer.html")
  #' @param height Iframe height: number (pixels) or string (e.g., "80%") (default: 600)
  #' @return HTML string for iframe

  # Check file exists
  if (!file.exists(audio_path)) {
    stop(paste("Audio file not found:", audio_path))
  }

  # Calculate relative path from viewer to audio
  audio_relative <- calculate_relative_path(audio_path, viewer_url)

  # URL encode (keep slashes for readability)
  encoded <- URLencode(audio_relative, reserved = FALSE)

  # Format height - convert number to string, keep strings as-is
  height_str <- as.character(height)

  # Create iframe with data-external="1" to prevent Quarto from embedding it as data URL
  iframe <- sprintf(
    '<iframe
  data-external="1"
  src="%s?audio=%s&overlays=%s"
  width="100%%"
  height="%s"
  frameborder="0"
  style="border: 1px solid #ddd; border-radius: 4px;">
</iframe>',
    viewer_url,
    encoded,
    overlays,
    height_str
  )

  return(iframe)
}

# Command-line interface (only runs when executed as a script, not when sourced)
if (sys.nframe() == 0) {
  args <- commandArgs(trailingOnly = TRUE)

  if (length(args) < 1) {
    cat("Usage: Rscript create-iframe.R <audio-file> [overlays] [viewer-url] [height]\n")
    cat("Example: Rscript create-iframe.R audio.wav 'pitch,formants,hnr' './ozen-web/viewer.html' 800\n")
    cat("         Rscript create-iframe.R audio.wav 'pitch,formants' './ozen-web/viewer.html' '80%'\n")
    quit(status = 1)
  }

  audio_path <- args[1]
  overlays <- if (length(args) >= 2) args[2] else "pitch,formants"
  viewer_url <- if (length(args) >= 3) args[3] else "./ozen-web/viewer.html"
  # Height can be numeric (pixels) or string (percentage)
  height <- if (length(args) >= 4) args[4] else 600

  tryCatch({
    html <- create_embedded_viewer(audio_path, overlays, viewer_url, height)
    cat(html, "\n")
  }, error = function(e) {
    cat("Error:", conditionMessage(e), "\n", file = stderr())
    quit(status = 1)
  })
}
