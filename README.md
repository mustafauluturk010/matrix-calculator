# Matrix Calculator

**Matrix Calculator** is a mobile matrix calculator built with React Native and Expo.

The application supports common matrix operations as well as more advanced topics such as determinants, inverse matrices, RREF, rank, LU decomposition, eigenvalues, eigenvectors, and linear systems.

Calculation steps can be displayed for many operations, making the application useful not only for getting a result but also for following the calculation process.

## Features

### Matrix Operations

* Matrix addition and subtraction
* Scalar multiplication
* Matrix multiplication
* Transpose
* Trace
* Determinant
* Inverse matrix
* Rank
* RREF
* Matrix powers
* LU decomposition
* Linear system solving

Matrices up to **6×6** are currently supported.

### Eigenvalues & Eigenvectors

The application supports eigenvalue and eigenvector calculations for both real and complex results.

Features include:

* Eigenvalues
* Eigenvectors
* 2×2 and 3×3 symbolic calculations
* Repeated eigenvalues
* Complex eigenvalues
* Complex eigenvectors
* General eigenvalue calculations for larger matrices
* Step-by-step results

### Linear Systems

Systems in the form

```text
Ax = b
```

can be solved using:

* Gaussian elimination
* Cramer's rule

The solver also detects:

* Unique solutions
* No solution
* Infinitely many solutions

## Symbolic Mathematics

One of the main features of the project is its symbolic calculation engine.

The calculator can work with expressions containing rational numbers, π and square roots.

Examples:

```text
π
√2
2√3
π/2
3π√2/4
1 + π
2√3 - 1/2
(1 + π)/2
```

When possible, calculations are kept in exact symbolic form instead of being converted to decimal values.

Supported symbolic operations include:

* Addition and subtraction
* Multiplication
* Scalar multiplication
* Determinants
* Inverse matrices
* Rank
* RREF
* Matrix powers
* Gaussian elimination
* LU decomposition
* Linear systems

Expressions involving powers and square roots are also supported in many cases:

```text
2^3
π^2
(1 + √2)^-1
√(5 - 2√6)
```

If an expression falls outside the supported symbolic calculation path, the application can fall back to numerical calculation.

## Complex Number Mode

Complex number support can be enabled from the application settings.

Examples of supported input:

```text
3 + 2i
i
-i/2
(1 + i)/√2
2πi
```

Complex calculations include:

* Addition
* Subtraction
* Multiplication
* Scalar multiplication
* Transpose
* Trace
* Determinant
* Inverse
* Rank
* RREF
* Gaussian elimination
* LU decomposition
* Matrix powers
* Linear systems
* Eigenvalues
* Eigenvectors

The application attempts exact complex arithmetic first and uses numerical complex calculations when an expression cannot be handled by the exact calculation path.

## Step-by-Step Calculations

The application can show the calculation process for many operations.

Examples include:

* Determinants
* Matrix inverses
* RREF
* Gaussian elimination
* LU decomposition
* Linear systems
* Eigenvalues
* Eigenvectors

This makes it possible to see how a result was obtained rather than only displaying the final answer.

## History & Saved Matrices

The application includes local storage for calculations and matrices.

### Calculation History

Previous calculations can be viewed from the history screen.

### Saved Matrices

Matrices can be saved with custom names and loaded again later.

History and saved matrices are stored locally using `AsyncStorage`.

## Export & Sharing

Calculation results can be exported as PDF files and shared using the device's native sharing interface.

The project uses:

* `expo-print` for PDF generation
* `expo-sharing` for sharing
* `expo-clipboard` for copying results

Symbolic expressions and calculation steps are included where supported.

## Interface

The application includes:

* Light and dark themes
* Dynamic matrix dimensions
* Matrix input controls
* Categorized operations
* Calculation history
* Saved matrices
* Settings
* Turkish and English localization
* UI animations

## Technology Stack

### Mobile

* React Native
* Expo
* TypeScript

### State Management

* Zustand
* AsyncStorage

### Navigation & UI

* React Navigation
* React Native Reanimated

### Other Libraries

* Expo Print
* Expo Sharing
* Expo Clipboard

## Project Structure

```text
matrix-calculator/
│
├── App.tsx
├── app.json
├── babel.config.js
├── package.json
├── tsconfig.json
├── assets/
│
└── src/
    ├── components/
    ├── hooks/
    ├── i18n/
    ├── navigation/
    ├── screens/
    ├── store/
    ├── theme/
    ├── types/
    └── utils/
```

The main mathematical functionality is separated from the React Native UI.

Some of the core modules include:

```text
src/utils/
├── matrixUtils.ts
├── complexOps.ts
├── complexField.ts
├── complexEigen.ts
├── eigenGeneral.ts
├── fracOps.ts
├── symFrac.ts
├── symbolic.ts
├── symbolicOps.ts
├── quadExt.ts
├── runOperation.ts
├── pdfExport.ts
└── latexExport.ts
```

This separation allows the mathematical functions to be tested independently from the application interface.

## Testing

The project contains unit and property-based tests covering different parts of the calculation engine.

Tests include areas such as:

* Matrix operations
* Determinants
* Inverse matrices
* RREF
* Rank
* LU decomposition
* Eigenvalues
* Eigenvectors
* Complex arithmetic
* Symbolic calculations
* Fractions
* Number formatting
* Matrix utilities
* UI components

Run the tests with:

```bash
npm test
```

## Installation

Clone the repository:

```bash
git clone https://github.com/mustafauluturk010/matrix-calculator.git
```

Open the project directory:

```bash
cd matrix-calculator
```

Install dependencies:

```bash
npm install
```

Start the Expo development server:

```bash
npx expo start
```

### Android

```bash
npx expo start --android
```

### iOS

```bash
npx expo start --ios
```

The application can also be tested on a physical device using Expo Go when supported by the project configuration.

## Development

The calculation engine is kept separate from the application UI.

Most mathematical operations return a structured result containing:

* Calculation status
* Result data
* Error information when necessary
* Calculation steps

This allows the same calculation logic to be used by the UI, tests, PDF export and other parts of the application.

## Current Limitations

Some features have intentionally defined limits.

* Matrix size is currently limited to 6×6.
* Symbolic calculations focus on rational numbers, π and square roots.
* Cube roots and arbitrary symbolic constants are not currently supported.
* Some complex symbolic expressions fall back to numerical calculation.
* Very complex symbolic expressions may fall back to numerical calculations.
* Some symbolic RREF, Gaussian elimination and LU operations may fall back to numerical calculation when intermediate expressions become too complex.

These fallbacks are intended to keep calculations practical and avoid displaying unreliable symbolic results.

## Roadmap

Some possible future improvements include:

* Improved symbolic support for larger matrices
* More symbolic eigenvalue and eigenvector cases
* Improved complex symbolic calculations
* Camera-based matrix input
* OCR support
* Cloud synchronization
* Additional languages
* More export options

### Camera & OCR

Camera-based matrix recognition is not currently included.

A future version could use a camera or image picker together with an OCR system to recognize a matrix from an image and convert it into the application's matrix input format.

## About the Project

This project was developed as a practical combination of mathematics, statistics and software development.

Instead of relying entirely on external mathematical libraries, several parts of the calculation engine were implemented specifically for the project, including matrix operations, symbolic expressions, fractions, complex numbers, eigenvalue calculations and step-by-step solution generation.

The project is also an ongoing way to explore TypeScript, React Native, testing and software architecture.

## Author

**Mustafa Ulutürk**

Statistics student interested in:

* Statistics
* Data Analysis
* Python
* Machine Learning
* Mathematics
* Mobile Application Development

GitHub:
https://github.com/mustafauluturk010
