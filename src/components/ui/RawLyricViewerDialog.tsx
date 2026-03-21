import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	Tab,
	Tabs,
	Tooltip,
	Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import type { RawLyricData } from "@/store";
import { copyTextToClipboard } from "@/utils/clipboard";

export interface RawLyricViewerDialogProps {
	open: boolean;
	onClose: () => void;
	content: RawLyricData | null;
}

export function RawLyricViewerDialog({
	open,
	onClose,
	content,
}: RawLyricViewerDialogProps) {
	const [tabIndex, setTabIndex] = useState(0);
	const [copySuccess, setCopySuccess] = useState(false);

	useEffect(() => {
		if (open) {
			setTabIndex(0);
			setCopySuccess(false);
		}
	}, [open]);

	const availableTabs: { label: string; text: string }[] = [];
	if (content?.main)
		availableTabs.push({ label: "主歌词", text: content.main });
	if (content?.trans)
		availableTabs.push({ label: "翻译", text: content.trans });
	if (content?.roma)
		availableTabs.push({ label: "罗马音", text: content.roma });

	const safeTabIndex = Math.min(
		tabIndex,
		Math.max(0, availableTabs.length - 1),
	);
	const currentTab = availableTabs[safeTabIndex];

	const handleCopy = async () => {
		if (currentTab?.text) {
			const success = await copyTextToClipboard(currentTab.text);
			if (success) {
				setCopySuccess(true);
				setTimeout(() => setCopySuccess(false), 2000);
			}
		}
	};

	const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
		setTabIndex(newValue);
		setCopySuccess(false);
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
			<DialogTitle sx={{ fontWeight: "bold" }}>查看原始歌词</DialogTitle>

			<DialogContent dividers sx={{ display: "flex", flexDirection: "column" }}>
				{availableTabs.length > 0 ? (
					<>
						<Box
							sx={{
								borderBottom: 1,
								borderColor: "divider",
								display: "flex",
								alignItems: "center",
								justifyContent: "space-between",
								bgcolor: "background.paper",
								pr: 1,
							}}
						>
							<Tabs
								value={safeTabIndex}
								onChange={handleTabChange}
								variant="scrollable"
								scrollButtons="auto"
								sx={{ px: 2, flex: 1 }}
							>
								{availableTabs.map((tab) => (
									<Tab key={tab.label} label={tab.label} />
								))}
							</Tabs>

							<Tooltip title={copySuccess ? "已复制" : "复制"}>
								<IconButton
									onClick={handleCopy}
									size="small"
									color="primary"
									sx={{ mr: 1 }}
								>
									<ContentCopyIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</Box>

						<Box
							sx={{
								p: 2,
								flex: 1,
								overflowY: "auto",
								bgcolor: "background.default",
							}}
						>
							<Box
								component="pre"
								sx={{
									m: 0,
									whiteSpace: "pre-wrap",
									wordBreak: "break-all",
									fontFamily: "monospace",
									fontSize: "0.875rem",
									color: "text.primary",
									userSelect: "text",
									WebkitUserSelect: "text",
								}}
							>
								{currentTab.text}
							</Box>
						</Box>
					</>
				) : (
					<Box
						sx={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							minHeight: "150px",
						}}
					>
						<Typography color="text.secondary">暂无歌词</Typography>
					</Box>
				)}
			</DialogContent>

			<DialogActions>
				<Button onClick={onClose} color="inherit">
					关闭
				</Button>
			</DialogActions>
		</Dialog>
	);
}
