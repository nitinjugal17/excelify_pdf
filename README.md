
# PDF to Excel OCR Pipeline

Welcome to the **PDF to Excel OCR Pipeline**, a powerful and flexible web application designed to extract structured data from PDF documents and convert it into clean, usable Excel files. This tool moves beyond simple OCR by providing a multi-stage, configurable pipeline, allowing you to choose the right engine and refinement tools for your specific documents.

![App Screenshot](https://placehold.co/1200x600.png?text=App+Interface)

## Why Choose This App?

Standard OCR tools often fail on complex layouts, noisy scans, or multi-lingual documents. This application was built to solve those problems by providing:

*   **Unmatched Flexibility:** Choose from four different OCR engines, from a privacy-first, in-browser option to powerful cloud-based solutions, ensuring you have the right tool for any document's complexity.
*   **Precision Control:** Don't just extract text; structure it. Use our visual Region of Interest (ROI) selector, AI-powered rule suggestions, and manual refinement tools to get the exact data you need, formatted correctly.
*   **Iterative Workflow:** The extraction process is not a black box. You can process a document, review the raw text, refine your rules or selected regions, and re-process on the fly without ever needing to re-upload your file.
*   **AI-Assisted Structuring:** For complex, non-tabular data, leverage the integrated AI to analyze the raw text and suggest initial data keys (headers) and cleaning rules, giving you a massive head start on structuring your data.

## Key Features

- **Multiple OCR Engines:**
    - **Tesseract.js:** Runs completely in your browser. Free, private, and highly configurable. Best for general-purpose OCR with full manual control.
    - **Amazon Textract:** A high-accuracy, cloud-based service that automatically detects and preserves table structures. Ideal for well-structured documents.
    - **Google Cloud Vision:** A premium, high-accuracy cloud OCR service that excels at recognizing text in noisy or complex images.
    - **OCR.space:** A popular online OCR service with a generous free tier and broad language support.
- **Visual Region of Interest (ROI) Selection:** For the Tesseract engine, you can draw boxes directly on the page preview to specify the exact areas for text extraction, dramatically improving accuracy on documents with fixed layouts like forms or ID cards.
- **AI-Powered Rule Suggestions:** Analyze the raw OCR text from a page and let the AI suggest potential column headers and data cleaning rules to get you started.
- **Advanced Manual Controls:**
    - Define multiple **Extraction Tasks** to export data into separate sheets in your final Excel file.
    - Specify custom **Data Keys** (column headers).
    - Use **Junk Eliminators** to remove rows containing unwanted keywords (e.g., "Page No.", "Header Text").
    - Perform batch **Find and Replace** operations to correct common OCR errors (e.g., 'O' -> '0').
- **Live Data Preview:** Instantly see a preview of how your structured data will look in a table based on the rules you've defined for each task.
- **Advanced Pre-processing:**
    - **In-browser binarization** to improve image contrast.
    - **External API integration** to connect your own image pre-processing server (e.g., using OpenCV) for tasks like skew correction or noise removal.
- **Secure and Private Options:** When using the Tesseract.js engine, your files are never uploaded to a server; all processing happens directly in your browser.

## Technology Stack

This application is built with a modern, robust tech stack:

- **Frontend:** [Next.js](https://nextjs.org/) (with App Router), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/), [shadcn/ui](https://ui.shadcn.com/)
- **AI/Generative:** [Google Genkit](https://firebase.google.com/docs/genkit) for AI-powered suggestions.
- **Client-Side Processing:** [Tesseract.js](https://tesseract.projectnaptha.com/), [PDF.js](https://mozilla.github.io/pdf.js/)
- **API Integrations:** [AWS SDK for Textract](https://aws.amazon.com/textract/), [Google Cloud Vision API](https://cloud.google.com/vision), [OCR.space API](https://ocr.space/ocrapi)

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/en) (v18 or later recommended)
- `npm`, `yarn`, or `pnpm`

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-repo/pdf-to-excel-ocr.git
    cd pdf-to-excel-ocr
    ```
2.  Install the dependencies:
    ```bash
    npm install
    ```
3.  Set up your environment variables. Create a file named `.env` in the root of the project by copying the example:
    ```bash
    cp .env.example .env
    ```
    Then, fill in the necessary API keys and credentials in the `.env` file.

### Environment Variables

To use the cloud-based OCR engines, you need to provide the necessary credentials.

```env
# .env

# === OCR.space Configuration ===
# Get a free API key from https://ocr.space/ocrapi
OCR_SPACE_API_KEY="YOUR_OCR_SPACE_API_KEY"

# === AWS Textract Configuration ===
# Your AWS IAM user credentials with Textract permissions.
AWS_ACCESS_KEY_ID="YOUR_AWS_ACCESS_KEY_ID"
AWS_SECRET_ACCESS_KEY="YOUR_AWS_SECRET_ACCESS_KEY"
AWS_DEFAULT_REGION="us-east-1" # Or your preferred AWS region

# === Google Cloud Vision Configuration ===
# This requires you to have the Google Cloud SDK authenticated on your machine
# or to set the GOOGLE_APPLICATION_CREDENTIALS environment variable.
# See: https://cloud.google.com/docs/authentication/provide-credentials-adc
# Example:
# GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/service-account-key.json"
```

### Running the Development Server

Once your environment is configured, you can start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How to Use the Application

1.  **Step 1: Choose Your Engine**
    - Select the OCR engine that best suits your document and needs. See the descriptions in the UI for guidance.

2.  **Step 2: Configure the Engine**
    - If you choose a cloud engine, ensure you have set the corresponding API keys in your `.env` file.
    - For Tesseract and OCR.space, select the language(s) present in your document.

3.  **Step 3: Upload Your PDF(s)**
    - Drag and drop your PDF files into the upload area or click to browse. The app will generate page previews.

4.  **Step 4: Select Pages & Define Regions (Optional)**
    - In the file processing panel, select the checkboxes for the pages you want to extract data from.
    - **For Tesseract:** If your document has a fixed layout, you can now draw boxes on the page preview to define the specific regions for OCR. This is highly recommended for accuracy.

5.  **Step 5: Process the File**
    - Click "Process Selected Page(s)" to start the OCR extraction.

6.  **Step 6: Review, Refine, and Structure**
    - **Review Raw Text:** An accordion will appear showing the raw extracted text. You can manually edit this text to correct any OCR errors.
    - **Refine with ROIs (Tesseract):** If the initial extraction is messy, you can now draw regions on the page image and click "Re-run OCR on Region(s)" to perform a more focused extraction.
    - **Create Extraction Tasks:** For each sheet you want in your final Excel file, create a task.
    - **Define Rules:**
        - Use "Get AI Suggestions" to have the AI analyze the text and propose headers and cleaning rules.
        - Manually enter the column headers (Data Keys), column separator, junk eliminators, and find/replace rules.
    - **Preview Data:** Click "Preview Data" within a task card to see a live preview of the structured table based on your current rules.

7.  **Step 7: Download Your Excel File**
    - Once you are satisfied with your data previews, click the "Download Excel" button.

## Contributing

Contributions are welcome! If you have a suggestion or find a bug, please open an issue. If you'd like to contribute code, please fork the repository and open a pull request.

1.  Fork the Project
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4.  Push to the Branch (`git push origin feature/AmazingFeature`)
5.  Open a Pull Request

## License

This project is licensed under the MIT License. See the `LICENSE` file for more details.
