/**
 * Venn Diagram — Renders Venn diagrams for sig-electrode overlap across conditions.
 *
 * Supports 2-set, 3-set, and up to 5-set (using Euler/UpSet-style fallback)
 * Venn diagrams rendered onto an offscreen <canvas> element.
 *
 * Each "set" is a collection of significant electrode names from a particular
 * phase/condition/direction combination.
 */
class VennDiagram {
    constructor() {
        // Color palette for Venn circles
        this.COLORS = [
            '#4fc3f7', // cyan
            '#ff8a65', // orange
            '#81c784', // green
            '#ba68c8', // purple
            '#ffd54f', // yellow
            '#e57373', // red
            '#4db6ac', // teal
            '#90a4ae', // grey-blue
        ];
    }

    /**
     * Render a Venn diagram to canvas and return a data URL.
     *
     * @param {Array<{label: string, items: Set<string>}>} sets
     *   Array of sets. Each has a human-readable label and a Set of electrode names.
     * @param {number} width - Canvas width in pixels.
     * @param {number} height - Canvas height in pixels.
     * @param {string} title - Title to display above the diagram.
     * @param {string} bgColor - Background color (hex).
     * @returns {string} data URL of the rendered image.
     */
    render(sets, width, height, title = '', bgColor = '#ffffff') {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);

        if (sets.length === 0) {
            ctx.fillStyle = '#666';
            ctx.font = '16px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No sets to display', width / 2, height / 2);
            return canvas.toDataURL('image/png');
        }

        // Title
        let titleHeight = 0;
        if (title) {
            titleHeight = this._drawWrappedTitle(ctx, title, width, height);
        }

        const n = sets.length;

        if (n <= 3) {
            this._renderCircleVenn(ctx, sets, width, height, titleHeight);
        } else {
            // For 4+ sets, use a matrix/UpSet-style visualization
            this._renderMatrixVenn(ctx, sets, width, height, titleHeight);
        }

        return canvas.toDataURL('image/png');
    }

    // =========================================================================
    // Circle Venn (2-3 sets)
    // =========================================================================

    _renderCircleVenn(ctx, sets, width, height, titleHeight) {
        const n = sets.length;
        // Font scale relative to default 800×600 canvas
        const fs = Math.min(width, height) / 600;

        const drawArea = {
            x: 0,
            y: titleHeight,
            w: width,
            h: height - titleHeight,
        };

        // Reserve space for legend at bottom
        const legendHeight = Math.round(80 * fs);
        const circleArea = {
            x: drawArea.x,
            y: drawArea.y,
            w: drawArea.w,
            h: drawArea.h - legendHeight,
        };

        const cx = circleArea.x + circleArea.w / 2;
        const cy = circleArea.y + circleArea.h / 2;

        // Compute all intersections
        const allIntersections = this._computeAllIntersections(sets);

        if (n === 1) {
            const r = Math.min(circleArea.w, circleArea.h) * 0.3;
            this._drawEllipse(ctx, cx, cy, r, r, this.COLORS[0], 0.25);
            this._drawEllipseStroke(ctx, cx, cy, r, r, this.COLORS[0], 2);

            ctx.fillStyle = '#333';
            ctx.font = `bold ${Math.round(13 * fs)}px Arial, sans-serif`;
            ctx.textAlign = 'center';
            ctx.fillText(sets[0].label, cx, cy - r - 10 * fs);

            ctx.font = `bold ${Math.round(18 * fs)}px Arial, sans-serif`;
            ctx.fillStyle = '#333';
            ctx.fillText(String(sets[0].items.size), cx, cy + 6 * fs);
        } else if (n === 2) {
            this._assignProportionalRadii(sets, circleArea, 0.28);
        } else if (n === 3) {
            this._assignProportionalRadii(sets, circleArea, 0.24);
        }

        if (n === 2) {
            this._renderTwoSetVenn(ctx, sets, cx, cy, circleArea, allIntersections, fs);
        } else if (n === 3) {
            this._renderThreeSetVenn(ctx, sets, cx, cy, circleArea, allIntersections, fs);
        }

        // Draw legend
        this._drawLegend(ctx, sets, drawArea.x, drawArea.y + drawArea.h - legendHeight + Math.round(10 * fs), drawArea.w, legendHeight, fs);
    }

    _renderTwoSetVenn(ctx, sets, cx, cy, area, intersections, fs) {
        const r0 = sets[0]._r;
        const r1 = sets[1]._r;

        // Compute overlap distance based on intersection ratio
        const s0 = sets[0].items;
        const s1 = sets[1].items;
        const inter01 = this._intersect(s0, s1);
        const d = this._overlapDistance(r0, r1, s0.size, s1.size, inter01.size);

        // Position circles so that the pair is centered
        const totalSpan = d + r0 + r1;
        const leftEdge = cx - totalSpan / 2;
        const circles = [
            { x: leftEdge + r0, y: cy, r: r0 },
            { x: leftEdge + r0 + d, y: cy, r: r1 },
        ];

        // Draw filled circles
        for (let i = 0; i < 2; i++) {
            this._drawEllipse(ctx, circles[i].x, circles[i].y, circles[i].r, circles[i].r, this.COLORS[i], 0.2);
        }
        // Draw strokes
        for (let i = 0; i < 2; i++) {
            this._drawEllipseStroke(ctx, circles[i].x, circles[i].y, circles[i].r, circles[i].r, this.COLORS[i], 2.5);
        }

        // Compute exclusive counts
        const only0 = s0.size - inter01.size;
        const only1 = s1.size - inter01.size;

        ctx.font = `bold ${Math.round(16 * fs)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#333';

        // Only A — center of the exclusive left region
        ctx.fillText(String(only0), circles[0].x - r0 * 0.4, cy + 6 * fs);
        // Only B — center of the exclusive right region
        ctx.fillText(String(only1), circles[1].x + r1 * 0.4, cy + 6 * fs);
        // Intersection
        if (inter01.size > 0) {
            const midX = (circles[0].x + circles[1].x) / 2;
            ctx.fillStyle = '#c62828';
            ctx.fillText(String(inter01.size), midX, cy + 6 * fs);
        }

        // Labels above circles
        ctx.font = `bold ${Math.round(12 * fs)}px Arial, sans-serif`;
        ctx.fillStyle = '#333';
        ctx.fillText(sets[0].label, circles[0].x, circles[0].y - r0 - 10 * fs);
        ctx.fillText(sets[1].label, circles[1].x, circles[1].y - r1 - 10 * fs);
    }

    _renderThreeSetVenn(ctx, sets, cx, cy, area, intersections, fs) {
        const radii = sets.map(s => s._r);
        const rAvg = radii.reduce((a, b) => a + b, 0) / 3;

        // Compute pairwise overlap distances
        const s = sets.map(s => s.items);
        const i01 = this._intersect(s[0], s[1]);
        const i02 = this._intersect(s[0], s[2]);
        const i12 = this._intersect(s[1], s[2]);

        const d01 = this._overlapDistance(radii[0], radii[1], s[0].size, s[1].size, i01.size);
        const d02 = this._overlapDistance(radii[0], radii[2], s[0].size, s[2].size, i02.size);
        const d12 = this._overlapDistance(radii[1], radii[2], s[1].size, s[2].size, i12.size);

        // Place circles using pairwise distances
        // Circle 0 at origin, Circle 1 at (d01, 0), Circle 2 via triangulation
        const positions = this._triangulate(d01, d02, d12);

        // Center the layout
        const avgX = positions.reduce((a, p) => a + p.x, 0) / 3;
        const avgY = positions.reduce((a, p) => a + p.y, 0) / 3;
        const circles = positions.map((p, i) => ({
            x: cx + (p.x - avgX),
            y: cy + (p.y - avgY),
            r: radii[i],
        }));

        // Draw filled circles
        for (let i = 0; i < 3; i++) {
            this._drawEllipse(ctx, circles[i].x, circles[i].y, circles[i].r, circles[i].r, this.COLORS[i], 0.18);
        }
        // Draw strokes
        for (let i = 0; i < 3; i++) {
            this._drawEllipseStroke(ctx, circles[i].x, circles[i].y, circles[i].r, circles[i].r, this.COLORS[i], 2.5);
        }

        // Compute all region counts
        const i012 = this._intersect(i01, s[2]);

        const only0 = s[0].size - (i01.size + i02.size - i012.size);
        const only1 = s[1].size - (i01.size + i12.size - i012.size);
        const only2 = s[2].size - (i02.size + i12.size - i012.size);
        const only01 = i01.size - i012.size;
        const only02 = i02.size - i012.size;
        const only12 = i12.size - i012.size;

        ctx.font = `bold ${Math.round(14 * fs)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#333';

        // Exclusive regions — push label outward from center
        for (let i = 0; i < 3; i++) {
            const dirX = circles[i].x - cx;
            const dirY = circles[i].y - cy;
            const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
            const labelDist = circles[i].r * 0.5;
            const lx = circles[i].x + (dirX / dist) * labelDist;
            const ly = circles[i].y + (dirY / dist) * labelDist;
            ctx.fillText(String([only0, only1, only2][i]), lx, ly + 5 * fs);
        }

        // Pairwise labels (between pair centers, offset outward from global center)
        ctx.font = `bold ${Math.round(13 * fs)}px Arial, sans-serif`;
        ctx.fillStyle = '#555';
        const pairs = [[0,1,only01], [0,2,only02], [1,2,only12]];
        for (const [a, b, count] of pairs) {
            if (count > 0) {
                const mx = (circles[a].x + circles[b].x) / 2;
                const my = (circles[a].y + circles[b].y) / 2;
                const dx = mx - cx, dy = my - cy;
                const md = Math.sqrt(dx * dx + dy * dy) || 1;
                const nudge = rAvg * 0.15;
                ctx.fillText(String(count), mx + (dx / md) * nudge, my + (dy / md) * nudge + 5 * fs);
            }
        }

        // Triple intersection (center of all three circles)
        if (i012.size > 0) {
            const triCx = (circles[0].x + circles[1].x + circles[2].x) / 3;
            const triCy = (circles[0].y + circles[1].y + circles[2].y) / 3;
            ctx.font = `bold ${Math.round(14 * fs)}px Arial, sans-serif`;
            ctx.fillStyle = '#c62828';
            ctx.fillText(String(i012.size), triCx, triCy + 5 * fs);
        }

        // Labels
        ctx.font = `bold ${Math.round(11 * fs)}px Arial, sans-serif`;
        ctx.fillStyle = '#333';
        for (let i = 0; i < 3; i++) {
            const dirX = circles[i].x - cx;
            const dirY = circles[i].y - cy;
            const dist = Math.sqrt(dirX * dirX + dirY * dirY) || 1;
            const lx = circles[i].x + (dirX / dist) * (circles[i].r + 14 * fs);
            const ly = circles[i].y + (dirY / dist) * (circles[i].r + 14 * fs);
            ctx.fillText(sets[i].label, lx, ly + 4 * fs);
        }
    }

    // =========================================================================
    // Matrix/UpSet-style for 4+ sets
    // =========================================================================

    _renderMatrixVenn(ctx, sets, width, height, titleHeight) {
        // For 4+ sets, render as an UpSet-style bar chart
        const allIntersections = this._computeAllIntersections(sets);

        // Sort by size (descending)
        allIntersections.sort((a, b) => b.size - a.size);

        // Limit to top 20 intersections
        const display = allIntersections.slice(0, 20);

        const marginLeft = 140;
        const marginTop = titleHeight + 20;
        const marginBottom = 40;
        const marginRight = 20;
        const barAreaWidth = width - marginLeft - marginRight;
        const barAreaHeight = (height - marginTop - marginBottom) * 0.55;
        const dotAreaHeight = (height - marginTop - marginBottom) * 0.35;
        const dotAreaTop = marginTop + barAreaHeight + 20;

        const n = display.length;
        if (n === 0) return;

        const barWidth = Math.min(30, (barAreaWidth - 20) / n);
        const gap = 4;
        const maxVal = display[0].size;

        // Draw bars
        for (let i = 0; i < n; i++) {
            const x = marginLeft + i * (barWidth + gap);
            const barH = (display[i].size / maxVal) * (barAreaHeight - 20);
            const y = marginTop + barAreaHeight - barH;

            ctx.fillStyle = '#4fc3f7';
            ctx.fillRect(x, y, barWidth, barH);

            // Value label
            ctx.fillStyle = '#333';
            ctx.font = '10px Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(String(display[i].size), x + barWidth / 2, y - 4);
        }

        // Draw dot matrix
        const dotR = Math.min(5, barWidth * 0.3);
        for (let i = 0; i < n; i++) {
            const x = marginLeft + i * (barWidth + gap) + barWidth / 2;
            const included = display[i].indices;

            for (let j = 0; j < sets.length; j++) {
                const y = dotAreaTop + j * (dotR * 3 + 4);
                const isIn = included.has(j);

                ctx.beginPath();
                ctx.arc(x, y, dotR, 0, Math.PI * 2);
                ctx.fillStyle = isIn ? '#333' : '#ddd';
                ctx.fill();
            }

            // Connect included dots
            const includedArr = [...included].sort((a, b) => a - b);
            if (includedArr.length > 1) {
                ctx.strokeStyle = '#333';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                const firstY = dotAreaTop + includedArr[0] * (dotR * 3 + 4);
                const lastY = dotAreaTop + includedArr[includedArr.length - 1] * (dotR * 3 + 4);
                ctx.moveTo(x, firstY);
                ctx.lineTo(x, lastY);
                ctx.stroke();
            }
        }

        // Set labels on the left
        ctx.fillStyle = '#333';
        ctx.font = '11px Arial, sans-serif';
        ctx.textAlign = 'right';
        for (let j = 0; j < sets.length; j++) {
            const y = dotAreaTop + j * (dotR * 3 + 4);
            ctx.fillText(`${sets[j].label} (${sets[j].items.size})`, marginLeft - 10, y + 4);
        }
    }

    // =========================================================================
    // Proportional radius helpers
    // =========================================================================

    /**
     * Assign area-proportional radii to sets, stored as set._r.
     * Radius ∝ √(size) so that circle area ∝ set size.
     * @param {Array} sets - Array of {items: Set, ...}
     * @param {object} area - {w, h} of the drawing area
     * @param {number} maxFraction - max radius as fraction of min(w,h)
     */
    _assignProportionalRadii(sets, area, maxFraction) {
        const sizes = sets.map(s => s.items.size);
        const maxSize = Math.max(...sizes);
        const rMax = Math.min(area.w, area.h) * maxFraction;
        const rMin = rMax * 0.35; // minimum radius so tiny sets are visible

        for (let i = 0; i < sets.length; i++) {
            if (maxSize === 0) {
                sets[i]._r = rMin;
            } else {
                const ratio = Math.sqrt(sizes[i] / maxSize);
                sets[i]._r = rMin + (rMax - rMin) * ratio;
            }
        }
    }

    /**
     * Compute the distance between two circle centers such that the geometric
     * overlap loosely reflects the intersection ratio.
     * Uses the overlap coefficient = |A∩B| / min(|A|, |B|).
     * @returns {number} distance between centers
     */
    _overlapDistance(r0, r1, size0, size1, interSize) {
        const minSize = Math.min(size0, size1);
        if (minSize === 0 || interSize === 0) {
            // No overlap — tangent + small gap
            return r0 + r1 + 4;
        }
        const overlapCoeff = Math.min(interSize / minSize, 1.0);
        const rSmall = Math.min(r0, r1);
        // overlapCoeff=0 → tangent (d = r0+r1)
        // overlapCoeff=1 → concentric-ish (d = |r0-r1|)
        const d = r0 + r1 - overlapCoeff * 2 * rSmall;
        return Math.max(d, Math.abs(r0 - r1) * 0.5);
    }

    /**
     * Triangulate positions of 3 circles given pairwise distances.
     * Places circle 0 at origin, circle 1 on x-axis, circle 2 via cosine rule.
     * @returns {Array<{x,y}>} positions
     */
    _triangulate(d01, d02, d12) {
        // Circle 0 at origin
        const p0 = { x: 0, y: 0 };
        // Circle 1 on x-axis
        const p1 = { x: d01, y: 0 };
        // Circle 2 via triangulation
        // cos(angle at 0) = (d01² + d02² - d12²) / (2 * d01 * d02)
        let cosA = 0;
        if (d01 > 0 && d02 > 0) {
            cosA = (d01 * d01 + d02 * d02 - d12 * d12) / (2 * d01 * d02);
            cosA = Math.max(-1, Math.min(1, cosA));
        }
        const sinA = Math.sqrt(1 - cosA * cosA);
        // Place circle 2 below the x-axis (positive y = downward in canvas)
        const p2 = { x: d02 * cosA, y: d02 * sinA };
        return [p0, p1, p2];
    }

    // =========================================================================
    // Set operations
    // =========================================================================

    _intersect(a, b) {
        const result = new Set();
        for (const x of a) {
            if (b.has(x)) result.add(x);
        }
        return result;
    }

    _computeAllIntersections(sets) {
        const n = sets.length;
        const results = [];

        // Enumerate all non-empty subsets of sets (by bitmask)
        for (let mask = 1; mask < (1 << n); mask++) {
            const indices = new Set();
            let inter = null;
            for (let i = 0; i < n; i++) {
                if (mask & (1 << i)) {
                    indices.add(i);
                    if (inter === null) {
                        inter = new Set(sets[i].items);
                    } else {
                        inter = this._intersect(inter, sets[i].items);
                    }
                }
            }

            // Compute exclusive count: items in this intersection but NOT in any superset
            // For UpSet, we want the exact intersection (only these sets, not others)
            let exactCount = 0;
            if (inter) {
                for (const item of inter) {
                    let inOther = false;
                    for (let i = 0; i < n; i++) {
                        if (!(mask & (1 << i)) && sets[i].items.has(item)) {
                            inOther = true;
                            break;
                        }
                    }
                    if (!inOther) exactCount++;
                }
            }

            if (exactCount > 0) {
                const labels = [];
                for (let i = 0; i < n; i++) {
                    if (mask & (1 << i)) labels.push(sets[i].label);
                }
                results.push({
                    indices,
                    labels,
                    size: exactCount,
                    mask,
                });
            }
        }

        return results;
    }

    // =========================================================================
    // Drawing helpers
    // =========================================================================

    _drawEllipse(ctx, cx, cy, rx, ry, color, alpha) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    _drawEllipseStroke(ctx, cx, cy, rx, ry, color, lineWidth) {
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    _drawLegend(ctx, sets, x, y, totalWidth, height, fs = 1) {
        ctx.save();
        const n = sets.length;
        const swatchSize = Math.round(14 * fs);
        const itemWidth = Math.min(200 * fs, (totalWidth - 20) / n);
        const startX = x + (totalWidth - n * itemWidth) / 2;

        for (let i = 0; i < n; i++) {
            const ix = startX + i * itemWidth;
            const iy = y + Math.round(10 * fs);

            // Color swatch
            ctx.fillStyle = this.COLORS[i];
            ctx.globalAlpha = 0.5;
            ctx.fillRect(ix, iy, swatchSize, swatchSize);
            ctx.globalAlpha = 1.0;
            ctx.strokeStyle = this.COLORS[i];
            ctx.lineWidth = 1.5;
            ctx.strokeRect(ix, iy, swatchSize, swatchSize);

            // Label
            ctx.fillStyle = '#333';
            ctx.font = `${Math.round(11 * fs)}px Arial, sans-serif`;
            ctx.textAlign = 'left';
            ctx.fillText(`${sets[i].label} (n=${sets[i].items.size})`, ix + swatchSize + 6, iy + swatchSize * 0.78);
        }

        // Total unique
        const allItems = new Set();
        for (const s of sets) {
            for (const item of s.items) allItems.add(item);
        }
        ctx.fillStyle = '#666';
        ctx.font = `${Math.round(11 * fs)}px Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`Total unique: ${allItems.size}`, x + totalWidth / 2, y + Math.round(40 * fs));

        ctx.restore();
    }

    /**
     * Draw title with auto-wrapping and adaptive font size.
     * Returns the total height consumed by the title block.
     */
    _drawWrappedTitle(ctx, title, canvasWidth, canvasHeight) {
        const maxWidth = canvasWidth - 40; // 20px padding each side
        const lineSpacing = 1.3;

        // Start with preferred size, shrink if needed (min 10px)
        let fontSize = Math.min(16, canvasHeight * 0.035);
        fontSize = Math.max(10, Math.round(fontSize));

        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';

        // Split title into segments on ' | ' to allow natural line breaks
        const segments = title.split(' | ');

        // Try to fit; reduce font if too many lines
        let lines;
        for (; fontSize >= 10; fontSize--) {
            ctx.font = `bold ${fontSize}px Arial, sans-serif`;
            lines = [];
            for (const seg of segments) {
                const words = seg.split(' ');
                let cur = '';
                for (const w of words) {
                    const test = cur ? cur + ' ' + w : w;
                    if (ctx.measureText(test).width > maxWidth && cur) {
                        lines.push(cur);
                        cur = w;
                    } else {
                        cur = test;
                    }
                }
                if (cur) lines.push(cur);
            }
            const totalH = lines.length * fontSize * lineSpacing + 10;
            if (totalH < canvasHeight * 0.15) break; // title shouldn't exceed 15% of canvas
        }

        ctx.font = `bold ${fontSize}px Arial, sans-serif`;
        const lineH = fontSize * lineSpacing;
        const startY = 8 + fontSize; // top padding + first baseline
        for (let i = 0; i < lines.length; i++) {
            ctx.fillText(lines[i], canvasWidth / 2, startY + i * lineH);
        }

        return startY + (lines.length - 1) * lineH + 10; // total title block height
    }
}
