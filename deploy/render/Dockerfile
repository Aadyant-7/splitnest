# Render supplies this non-secret build argument from the service environment.
# Use only the immutable GHCR digest that passed the source commit's CI scan.
# No source, credentials, extra packages or build tools are copied into this image.
ARG SPLITNEST_IMAGE
FROM ${SPLITNEST_IMAGE}
