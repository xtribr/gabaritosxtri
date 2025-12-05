# ENEM Answer Sheet Reader - Design Guidelines

## Design Approach
**System-Based Approach**: Material Design principles adapted for administrative/educational workflows
- Emphasizes data clarity and processing efficiency
- Professional interface for teachers and administrators
- Focus on task completion over visual flair

## Typography System
- **Primary Font**: Inter or Roboto (via Google Fonts CDN)
- **Hierarchy**:
  - Page title: text-3xl font-semibold
  - Section headers: text-xl font-medium
  - Data labels: text-sm font-medium uppercase tracking-wide
  - Body text: text-base
  - Table content: text-sm
  - Helper text: text-xs

## Layout & Spacing
**Spacing Primitives**: Use Tailwind units of 2, 4, 6, 8, 12, 16, 20
- Container: max-w-7xl mx-auto px-6
- Section padding: py-12
- Card padding: p-6 to p-8
- Element gaps: gap-4 to gap-6

## Core Components

### Upload Zone
- Large dropzone area (min-h-64) with dashed border (border-dashed border-2)
- Upload icon centered (use Heroicons CDN - cloud-arrow-up)
- Primary text: "Arraste o PDF do gabarito aqui"
- Secondary text: "ou clique para selecionar arquivo"
- File restrictions displayed: "Aceita PDF com múltiplas páginas"
- Active state when dragging files over

### PDF Preview Panel
- Thumbnail grid of uploaded pages (grid-cols-4 gap-4)
- Page number badges on each thumbnail
- Total pages indicator prominently displayed
- Remove file option with confirmation

### Processing Status
- Linear progress bar with percentage (h-2 rounded-full)
- Status messages: "Processando página X de Y..."
- Processing icon with pulse animation (Heroicons: cog-6-tooth)
- Estimated time remaining display

### Data Table
- Fixed header row with sticky positioning (sticky top-0)
- Columns: Número do Aluno | Nome | Respostas Marcadas | Gabarito | Acertos
- Zebra striping for rows (alternating background)
- Editable cells with inline edit capability
- Sort functionality on column headers (up/down arrows)
- Row selection checkboxes for bulk operations
- Compact row height for data density (h-12)

### Action Bar
- Fixed at top: "Exportar para Excel" button (primary, prominent)
- Secondary actions: "Limpar Tudo" | "Processar Novamente"
- Results summary: "X alunos processados com sucesso"

### Empty States
- Centered content with illustration placeholder
- "Nenhum PDF carregado ainda" message
- Clear call-to-action to upload

## Navigation Structure
Simple single-page application:
- Header with logo/title: "GabaritAI"
- No complex navigation needed
- Optional help/info icon linking to usage instructions

## Component Patterns

**Cards**: Elevated surfaces (shadow-md) with rounded corners (rounded-lg)
**Buttons**: 
- Primary: Full rounded (rounded-md), medium size (px-6 py-3)
- Secondary: Outlined variant
- Icon buttons: Square (w-10 h-10) with icon centered

**Alerts**: For errors/success messages
- Error: Red accent with exclamation icon
- Success: Green accent with check icon
- Info: Blue accent with info icon
- Positioned at top of page or inline with relevant section

**Form Elements**:
- Input fields: Outlined style with border, rounded corners (rounded-md)
- Focus states: Thicker border weight
- Labels positioned above inputs

## Data Visualization
- Success rate indicator: Simple percentage badge
- Question-by-question breakdown: Compact grid layout
- Error highlighting: Cells with issues get distinct treatment

## Responsive Behavior
- Desktop (lg): Full table with all columns visible
- Tablet (md): Scrollable table horizontally
- Mobile: Stack key data, expandable rows for details

## Images
No hero image needed - this is a utility application focused on immediate functionality. The upload dropzone serves as the primary visual anchor on page load.

## Performance Indicators
- File upload progress (0-100%)
- OCR processing progress per page
- Overall completion status
- Visual feedback during all async operations

## Workflow States
1. **Initial**: Empty upload zone prominent
2. **Uploaded**: PDF preview + process button enabled
3. **Processing**: Progress indicator + disable interactions
4. **Complete**: Data table populated + export enabled
5. **Error**: Clear error messages with retry options

**Language**: All interface text in Portuguese (Brazil)