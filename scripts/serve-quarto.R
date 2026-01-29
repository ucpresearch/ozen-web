#!/usr/bin/env Rscript
#' Simple HTTP server for viewing Quarto documents with embedded Ozen viewer
#'
#' Browsers block file:// iframes for security, so Quarto documents with
#' embedded viewer iframes must be served over HTTP.
#'
#' Usage:
#'   Rscript serve-quarto.R [directory] [port]
#'
#' Or from R console:
#'   source("scripts/serve-quarto.R")
#'   serve_quarto()  # Serves current directory on port 8000
#'   serve_quarto(".", 8080)  # Custom port

serve_quarto <- function(directory = ".", port = 8000) {
  if (!requireNamespace("servr", quietly = TRUE)) {
    message("Installing 'servr' package...")
    install.packages("servr")
  }

  path <- normalizePath(directory)
  message(sprintf("Serving %s at http://localhost:%d", path, port))
  message(sprintf("Open your Quarto document at: http://localhost:%d/your-document.html", port))
  message("Press Ctrl+C or Escape to stop")

  servr::httd(dir = directory, port = port, browser = FALSE)
}

# Command-line interface (only runs when executed as a script)
if (sys.nframe() == 0) {
  args <- commandArgs(trailingOnly = TRUE)
  directory <- if (length(args) >= 1) args[1] else "."
  port <- if (length(args) >= 2) as.integer(args[2]) else 8000

  serve_quarto(directory, port)
}
