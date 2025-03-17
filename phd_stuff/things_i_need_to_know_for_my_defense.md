# Basic things I need to know for my PhD

# Biology

# Immunology

# Mass spectrometry

# Machine learning
## Variational Autoencoders (VAE)


## Bayes theorem

$p(H|E) = \frac{p(H)\cdotp(E|H)}{p(E)}$

## Maximum likelihood

## General statistics

Chain rule for joint distribution: $p(z,x) = p(z) \cdot p(x|z)$

Marginalizing over z: $p(x) = \int_zp(z,x)dz = \int_zp(z)\cdotp(x|z)dz$

**Variational inference**
$ q_{\phi}(z|x) \approx p_{\theta}(z|x)$ 

**Kullback-Leibler divergence**
$D_{KL}(Q||P) = \int_z Q(z)log(\frac{Q(z)}{P(z)})dz $